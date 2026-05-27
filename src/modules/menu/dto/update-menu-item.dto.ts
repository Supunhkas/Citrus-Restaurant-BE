import { PartialType } from '@nestjs/mapped-types';
import { CreateMenuItemDto } from './create-menu-item.dto';

// Every field from CreateMenuItemDto becomes optional — perfect for PATCH.
export class UpdateMenuItemDto extends PartialType(CreateMenuItemDto) {}
