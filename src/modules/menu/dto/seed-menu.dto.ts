import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMenuItemDto } from './create-menu-item.dto';
import { CreateMenuCategoryDto } from './menu-category.dto';

// POST /menu/admin/seed previously typed its body as an inline object
// literal, which compiles to `Object` at runtime — a type Nest's
// ValidationPipe always skips. That let fully unvalidated data reach a raw
// Mongo upsert. This DTO makes the existing global ValidationPipe
// (whitelist/forbidNonWhitelisted/transform) actually apply here.
export class SeedMenuDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMenuItemDto)
  items: CreateMenuItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMenuCategoryDto)
  categories: CreateMenuCategoryDto[];
}
