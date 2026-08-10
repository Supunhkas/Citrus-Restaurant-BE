import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MenuItem, MenuItemDocument } from '../../schema/menu/menu-item.schema';
import {
  MenuCategory,
  MenuCategoryDocument,
} from '../../schema/menu/menu-category.schema';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
} from './dto/menu-category.dto';
import { MenuQueryDto } from './dto/menu-query.dto';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(MenuCategory.name)
    private readonly menuCategoryModel: Model<MenuCategoryDocument>,
  ) {}

  // ── Public: Menu Items ────────────────────────────────────────────────────

  /**
   * Public list — only available items returned by default.
   * Supports category filter, full-text search, and featured flag.
   */
  async getMenuItems(query: MenuQueryDto): Promise<MenuItem[]> {
    const filter: Record<string, any> = {};

    // Public callers always see only available items.
    // Admin passes available=false explicitly to see the full list.
    filter.isAvailable =
      query.available === false ? { $in: [true, false] } : true;

    if (query.category && query.category !== 'all') {
      filter.category = query.category;
    }

    if (query.featured === true) {
      filter.featured = true;
    }

    if (query.search) {
      filter.$text = { $search: query.search };
    }

    return this.menuItemModel
      .find(filter)
      .sort({ sortOrder: 1, createdAt: 1 })
      .limit(500)
      .lean()
      .exec();
  }

  async getMenuItemById(id: string): Promise<MenuItem> {
    const item = await this.menuItemModel.findById(id).lean().exec();
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  // ── Admin: Menu Items ─────────────────────────────────────────────────────

  async createMenuItem(dto: CreateMenuItemDto): Promise<MenuItem> {
    const item = new this.menuItemModel(dto);
    const saved = await item.save();
    this.logger.log(`Menu item created: ${saved.name}`);
    return saved;
  }

  async updateMenuItem(id: string, dto: UpdateMenuItemDto): Promise<MenuItem> {
    const item = await this.menuItemModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true, runValidators: true },
    );
    if (!item) throw new NotFoundException('Menu item not found');
    this.logger.log(`Menu item updated: ${item.name}`);
    return item;
  }

  async deleteMenuItem(id: string): Promise<{ message: string }> {
    const item = await this.menuItemModel.findByIdAndDelete(id);
    if (!item) throw new NotFoundException('Menu item not found');
    this.logger.log(`Menu item deleted: ${item.name}`);
    return { message: 'Menu item deleted successfully' };
  }

  /**
   * Toggle isAvailable without a full update — used by the
   * admin "available / sold out" switch on the menu management page.
   */
  async toggleAvailability(id: string): Promise<{ isAvailable: boolean }> {
    const item = await this.menuItemModel.findById(id);
    if (!item) throw new NotFoundException('Menu item not found');
    item.isAvailable = !item.isAvailable;
    await item.save();
    return { isAvailable: item.isAvailable };
  }

  // ── Public: Categories ────────────────────────────────────────────────────

  async getCategories(): Promise<MenuCategory[]> {
    return this.menuCategoryModel
      .find({ isActive: true })
      .sort({ sortOrder: 1 })
      .limit(500)
      .lean()
      .exec();
  }

  // ── Admin: Categories ─────────────────────────────────────────────────────

  async createCategory(dto: CreateMenuCategoryDto): Promise<MenuCategory> {
    const existing = await this.menuCategoryModel
      .findOne({ slug: dto.slug })
      .lean();
    if (existing) {
      throw new ConflictException(
        `Category with slug "${dto.slug}" already exists`,
      );
    }
    const category = new this.menuCategoryModel(dto);
    const saved = await category.save();
    this.logger.log(`Menu category created: ${saved.name}`);
    return saved;
  }

  async updateCategory(
    id: string,
    dto: UpdateMenuCategoryDto,
  ): Promise<MenuCategory> {
    const category = await this.menuCategoryModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true, runValidators: true },
    );
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async deleteCategory(id: string): Promise<{ message: string }> {
    const category = await this.menuCategoryModel.findByIdAndDelete(id);
    if (!category) throw new NotFoundException('Category not found');
    return { message: 'Category deleted successfully' };
  }

  // ── Seed helper ───────────────────────────────────────────────────────────

  /**
   * One-shot seed: migrates the static data/menu-items.ts data into MongoDB.
   * Call POST /menu/admin/seed once after deploying — idempotent via upsert.
   */
  async seed(
    items: CreateMenuItemDto[],
    categories: CreateMenuCategoryDto[],
  ): Promise<{ items: number; categories: number }> {
    let itemCount = 0;
    for (const dto of items) {
      await this.menuItemModel.updateOne(
        { name: dto.name, category: dto.category },
        { $setOnInsert: dto },
        { upsert: true },
      );
      itemCount++;
    }

    let catCount = 0;
    for (const dto of categories) {
      await this.menuCategoryModel.updateOne(
        { slug: dto.slug },
        { $setOnInsert: dto },
        { upsert: true },
      );
      catCount++;
    }

    this.logger.log(
      `Seed complete: ${itemCount} items, ${catCount} categories`,
    );
    return { items: itemCount, categories: catCount };
  }
}
