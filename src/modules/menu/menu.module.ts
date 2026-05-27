import { Module } from '@nestjs/common';
import { MenuAdminController, MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { MongooseModule } from '@nestjs/mongoose';
import { MenuItem, MenuItemSchema } from 'src/schema/menu/menu-item.schema';
import {
  MenuCategory,
  MenuCategorySchema,
} from 'src/schema/menu/menu-category.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: MenuCategory.name, schema: MenuCategorySchema },
    ]),
  ],
  controllers: [MenuController, MenuAdminController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
