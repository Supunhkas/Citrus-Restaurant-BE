import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const DIETARY_OPTIONS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'nut-free',
] as const;

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @IsIn([1, 2, 3])
  @Type(() => Number)
  spiceLevel?: number;

  @IsOptional()
  @IsArray()
  @IsIn(DIETARY_OPTIONS, { each: true })
  dietaryInfo?: string[];

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;
}
