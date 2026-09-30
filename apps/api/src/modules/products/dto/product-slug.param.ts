import { IsString, Matches, MaxLength } from 'class-validator';

export class ProductSlugParam {
  @IsString()
  @MaxLength(160)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;
}
