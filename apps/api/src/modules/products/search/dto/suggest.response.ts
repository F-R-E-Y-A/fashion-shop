import { ApiProperty } from '@nestjs/swagger';

import { ProductResponse } from '../../dto/product.response.js';
import { SearchInterpretationResponse } from './search-interpretation.response.js';

export class SuggestCategoryResponse {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'So san pham khop cau trong danh muc nay' }) count!: number;
}

export class SuggestQueryResponse {
  @ApiProperty({ description: 'Cau goi y, vd "áo polo nữ"' }) text!: string;
  @ApiProperty({ description: 'So san pham khop cau goi y' }) count!: number;
}

/** Goi y cho o tim kiem toan cuc: toi da 5 san pham, 3 danh muc, 4 cau goi y. */
export class SuggestResponse {
  @ApiProperty({ type: SearchInterpretationResponse })
  interpretation!: SearchInterpretationResponse;
  @ApiProperty({ description: 'Tong so san pham khop cau da go' }) total!: number;
  @ApiProperty({ type: [String], description: 'Cac buoc da noi truy van; rong neu khong phai noi' })
  relaxed!: string[];
  @ApiProperty({ type: [ProductResponse] }) products!: ProductResponse[];
  @ApiProperty({ type: [SuggestCategoryResponse] }) categories!: SuggestCategoryResponse[];
  @ApiProperty({ type: [SuggestQueryResponse] }) queries!: SuggestQueryResponse[];
}
