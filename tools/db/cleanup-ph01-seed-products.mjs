import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import pg from 'pg';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(repositoryRoot, '.env'), quiet: true });

function parseArgs(args) {
  let apply = false;
  let confirmDatabase = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--dry-run') apply = false;
    else if (args[index] === '--apply') apply = true;
    else if (args[index] === '--confirm-db') confirmDatabase = args[++index] ?? null;
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (apply && !confirmDatabase) throw new Error('--apply requires --confirm-db fashion_shop');
  if (confirmDatabase && confirmDatabase !== 'fashion_shop') {
    throw new Error('Only the local fashion_shop database is supported.');
  }
  return { apply, confirmDatabase };
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const databaseUrl = new URL(connectionString);
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname) || database !== 'fashion_shop') {
    throw new Error('Cleanup only permits the local fashion_shop development database.');
  }
  if (options.apply && options.confirmDatabase !== database) {
    throw new Error(`Confirmation mismatch: expected --confirm-db ${database}.`);
  }

  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(options.apply ? 'BEGIN' : 'BEGIN READ ONLY');
    const target = await client.query('SELECT current_database() AS database');
    if (target.rows[0]?.database !== database)
      throw new Error('Connected database does not match URL.');

    const products = await client.query(`
      SELECT p.id::text AS id, p.slug,
        count(v.id)::int AS variants,
        count(*) FILTER (WHERE v.sku LIKE 'SEED-%')::int AS seed_variants,
        (SELECT count(*)::int FROM product_images i WHERE i.product_id = p.id) AS images
      FROM products p
      JOIN product_variants v ON v.product_id = p.id
      GROUP BY p.id, p.slug
      HAVING bool_or(v.sku LIKE 'SEED-%')
      ORDER BY p.slug
    `);
    if (products.rows.some((product) => product.variants !== product.seed_variants)) {
      throw new Error('At least one product mixes SEED and non-SEED variants; cleanup stopped.');
    }
    const productIds = products.rows.map((product) => product.id);
    const variants = productIds.length
      ? await client.query(
          `SELECT id::text AS id FROM product_variants WHERE product_id = ANY($1::uuid[])`,
          [productIds],
        )
      : { rows: [] };
    const variantIds = variants.rows.map((variant) => variant.id);

    const foreignKeys = await client.query(`
      SELECT source_ns.nspname AS schema_name, source_table.relname AS table_name,
        source_column.attname AS column_name, target_table.relname AS referenced_table
      FROM pg_constraint fk
      JOIN pg_class source_table ON source_table.oid = fk.conrelid
      JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
      JOIN pg_class target_table ON target_table.oid = fk.confrelid
      JOIN pg_namespace target_ns ON target_ns.oid = target_table.relnamespace
      JOIN unnest(fk.conkey) WITH ORDINALITY source_key(attnum, position) ON true
      JOIN unnest(fk.confkey) WITH ORDINALITY target_key(attnum, position)
        ON target_key.position = source_key.position
      JOIN pg_attribute source_column
        ON source_column.attrelid = source_table.oid AND source_column.attnum = source_key.attnum
      WHERE fk.contype = 'f' AND target_ns.nspname = 'public'
        AND target_table.relname IN ('products', 'product_variants')
      ORDER BY source_ns.nspname, source_table.relname, source_column.attname
    `);
    const references = [];
    for (const foreignKey of foreignKeys.rows) {
      if (
        foreignKey.schema_name === 'public' &&
        ['product_images', 'product_variants'].includes(foreignKey.table_name)
      ) {
        continue;
      }
      const ids = foreignKey.referenced_table === 'products' ? productIds : variantIds;
      if (ids.length === 0) continue;
      const table = `${quoteIdentifier(foreignKey.schema_name)}.${quoteIdentifier(foreignKey.table_name)}`;
      const column = quoteIdentifier(foreignKey.column_name);
      const result = await client.query(
        `SELECT count(*)::int AS count FROM ${table} WHERE ${column}::text = ANY($1::text[])`,
        [ids],
      );
      if (result.rows[0].count > 0) {
        references.push({
          table: `${foreignKey.schema_name}.${foreignKey.table_name}`,
          column: foreignKey.column_name,
          referencedTable: foreignKey.referenced_table,
          count: result.rows[0].count,
        });
      }
    }

    const totals = await client.query(`
      SELECT
        (SELECT count(*)::int FROM products) AS products,
        (SELECT count(*)::int FROM product_variants) AS variants,
        (SELECT count(*)::int FROM product_images) AS images,
        (SELECT count(DISTINCT p.id)::int FROM products p JOIN product_variants v ON v.product_id=p.id
          WHERE v.sku LIKE 'SEED-%') AS seed_products
    `);
    const summary = {
      mode: options.apply ? 'apply' : 'dry-run',
      database,
      before: totals.rows[0],
      seedProducts: products.rows,
      seedVariants: variantIds.length,
      references,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!options.apply) {
      await client.query('ROLLBACK');
      return;
    }
    if (references.length > 0)
      throw new Error('Seed rows have foreign-key references; no rows deleted.');
    if (products.rows.length === 0)
      throw new Error('No SEED products found; refusing an empty cleanup.');

    const backups = productIds.length
      ? await client.query(
          `SELECT to_jsonb(p) AS product,
            (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.sku), '[]'::jsonb)
              FROM product_variants v WHERE v.product_id=p.id) AS variants,
            (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.sort_order), '[]'::jsonb)
              FROM product_images i WHERE i.product_id=p.id) AS images
          FROM products p WHERE p.id = ANY($1::uuid[]) ORDER BY p.slug`,
          [productIds],
        )
      : { rows: [] };
    const backup = {
      generatedAt: new Date().toISOString(),
      database,
      note: 'SEED product rows before PH-01 cleanup; taxonomy lookup rows are retained.',
      records: backups.rows,
    };
    const backupContent = `${JSON.stringify(backup, null, 2)}\n`;
    const backupHash = createHash('sha256').update(backupContent).digest('hex');
    const backupDirectory = resolve(repositoryRoot, '..', 'work', 'backups');
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = resolve(
      backupDirectory,
      `ph01-seed-products-${new Date().toISOString().replaceAll(':', '-')}.json`,
    );
    await writeFile(backupPath, backupContent, { encoding: 'utf8', flag: 'wx' });
    const savedBackup = await readFile(backupPath, 'utf8');
    const parsedBackup = JSON.parse(savedBackup);
    if (
      createHash('sha256').update(savedBackup).digest('hex') !== backupHash ||
      parsedBackup.records.length !== products.rows.length
    ) {
      throw new Error('Seed backup could not be verified; cleanup stopped.');
    }

    const imageDelete = await client.query(
      'DELETE FROM product_images WHERE product_id = ANY($1::uuid[])',
      [productIds],
    );
    const variantDelete = await client.query(
      'DELETE FROM product_variants WHERE product_id = ANY($1::uuid[])',
      [productIds],
    );
    const productDelete = await client.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [
      productIds,
    ]);
    const after = await client.query(`
      SELECT
        (SELECT count(*)::int FROM products) AS products,
        (SELECT count(*)::int FROM product_variants) AS variants,
        (SELECT count(*)::int FROM product_images) AS images,
        (SELECT count(DISTINCT p.id)::int FROM products p JOIN product_variants v ON v.product_id=p.id
          WHERE v.sku LIKE 'SEED-%') AS seed_products
    `);
    const deleted = {
      products: productDelete.rowCount,
      variants: variantDelete.rowCount,
      images: imageDelete.rowCount,
      backupPath,
      backupSha256: backupHash,
      after: after.rows[0],
    };
    const realProductsBefore = totals.rows[0].products - totals.rows[0].seed_products;
    const realProductsAfter = deleted.after.products - deleted.after.seed_products;
    if (
      deleted.products !== products.rows.length ||
      deleted.after.seed_products !== 0 ||
      realProductsBefore !== realProductsAfter ||
      deleted.variants !== variantIds.length ||
      deleted.images !== products.rows.reduce((sum, product) => sum + product.images, 0)
    ) {
      throw new Error(`Post-cleanup verification failed: ${JSON.stringify(deleted)}`);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ deleted }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
