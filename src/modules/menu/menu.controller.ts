import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { Public } from 'src/common/decorators/public.decorator';
import { MenuQueryDto } from './dto/menu-query.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
} from './dto/menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { SeedMenuDto } from './dto/seed-menu.dto';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // GET /menu/items?category=curries&featured=true&search=kottu
  @Public()
  @Get('items')
  getMenuItems(@Query() query: MenuQueryDto) {
    // `available` is an admin-only override (see
    // MenuAdminController.getAllItemsForAdmin below, which forces it
    // server-side) — a public, unauthenticated caller must never be able to
    // pull unavailable/86'd items by passing ?available=false themselves.
    return this.menuService.getMenuItems({ ...query, available: undefined });
  }

  // GET /menu/items/:id
  @Public()
  @Get('items/:id')
  getMenuItemById(@Param('id') id: string) {
    return this.menuService.getMenuItemById(id);
  }

  // GET /menu/categories
  @Public()
  @Get('categories')
  getCategories() {
    return this.menuService.getCategories();
  }
}

// ── Admin routes (/menu/admin) ───────────────────────────────────────────────
// All routes require JWT + admin role.

@Controller('menu/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class MenuAdminController {
  constructor(private readonly menuService: MenuService) {}

  // ── Items ────────────────────────────────────────────────────────────────

  // GET /menu/admin/items  (includes unavailable items — admin full view)
  @Get('items')
  getAllItemsForAdmin(@Query() query: MenuQueryDto) {
    return this.menuService.getMenuItems({ ...query, available: false });
  }

  // POST /menu/admin/items
  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  createMenuItem(@Body() dto: CreateMenuItemDto) {
    return this.menuService.createMenuItem(dto);
  }

  // PATCH /menu/admin/items/:id
  @Patch('items/:id')
  updateMenuItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menuService.updateMenuItem(id, dto);
  }

  // PATCH /menu/admin/items/:id/toggle-availability
  @Patch('items/:id/toggle-availability')
  toggleAvailability(@Param('id') id: string) {
    return this.menuService.toggleAvailability(id);
  }

  // DELETE /menu/admin/items/:id
  @Delete('items/:id')
  @HttpCode(HttpStatus.OK)
  deleteMenuItem(@Param('id') id: string) {
    return this.menuService.deleteMenuItem(id);
  }

  // ── Categories ───────────────────────────────────────────────────────────

  // GET /menu/admin/categories  (includes inactive categories)
  @Get('categories')
  getAllCategories() {
    return this.menuService.getCategories();
  }

  // POST /menu/admin/categories
  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  createCategory(@Body() dto: CreateMenuCategoryDto) {
    return this.menuService.createCategory(dto);
  }

  // PATCH /menu/admin/categories/:id
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateMenuCategoryDto) {
    return this.menuService.updateCategory(id, dto);
  }

  // DELETE /menu/admin/categories/:id
  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  deleteCategory(@Param('id') id: string) {
    return this.menuService.deleteCategory(id);
  }

  // ── Seed ─────────────────────────────────────────────────────────────────

  // POST /menu/admin/seed
  // Body: { items: CreateMenuItemDto[], categories: CreateMenuCategoryDto[] }
  // Call once after first deploy to migrate the static menu-items.ts data.

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  seed(@Body() body: SeedMenuDto) {
    return this.menuService.seed(body.items, body.categories);
  }
}
