import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class MenuQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // ?featured=true — shows only featured items (used on home page hero section)
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  featured?: boolean;

  // ?available=false — admin list view can see unavailable items
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  available?: boolean;
}
