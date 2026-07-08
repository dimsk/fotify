import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { SourceType } from './source.entity';

export class CreateSourceDto {
  @IsIn(['local', 'smb'])
  type: SourceType;

  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateIf((dto) => dto.type === 'local')
  @IsString()
  @IsNotEmpty()
  localPath?: string;

  @ValidateIf((dto) => dto.type === 'smb')
  @IsString()
  @IsNotEmpty()
  smbHost?: string;

  @ValidateIf((dto) => dto.type === 'smb')
  @IsString()
  @IsNotEmpty()
  smbShare?: string;

  @ValidateIf((dto) => dto.type === 'smb')
  @IsString()
  @IsNotEmpty()
  smbUsername?: string;

  @ValidateIf((dto) => dto.type === 'smb')
  @IsString()
  @IsNotEmpty()
  smbPassword?: string;

  @IsOptional()
  @IsString()
  smbDomain?: string;

  @IsOptional()
  @IsString()
  smbRootPath?: string;
}
