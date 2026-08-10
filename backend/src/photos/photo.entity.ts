import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Source } from '../sources/source.entity';

export type PhotoOrientation = 'portrait' | 'landscape' | 'square';
export type MediaType = 'image' | 'video';

@Index('IDX_photo_source_last_shown', ['sourceId', 'lastShownAt'])
@Index('IDX_photo_gps_coordinates', ['gpsLatitude', 'gpsLongitude'])
@Entity()
export class Photo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  sourceId: number;

  @ManyToOne(() => Source, (source) => source.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source: Source;

  @Column({ type: 'text' })
  relativePath: string;

  /** Legacy entity/table name retained so persisted queue ids remain valid. */
  @Index('IDX_photo_media_type')
  @Column({ type: 'text', default: 'image' })
  mediaType: MediaType;

  @Index({ unique: true })
  @Column({ type: 'text' })
  fileHash: string;

  @Column({ type: 'int' })
  width: number;

  @Column({ type: 'int' })
  height: number;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'text', nullable: true })
  mimeType: string | null;

  @Column({ type: 'text', nullable: true })
  videoCodec: string | null;

  @Column({ type: 'text', nullable: true })
  videoContainer: string | null;

  @Column({ type: 'int', nullable: true })
  sourceFileSize: number | null;

  @Column({ type: 'datetime', nullable: true })
  sourceModifiedAt: Date | null;

  @Index()
  @Column({ type: 'text' })
  orientation: PhotoOrientation;

  @Index('IDX_photo_captured_at')
  @Column({ type: 'datetime', nullable: true })
  capturedAt: Date | null;

  /** Lens model as reported by EXIF (LensModel tag) — null if absent from the file. */
  @Column({ type: 'text', nullable: true })
  lens: string | null;

  /** Aperture (f-number) as reported by EXIF (FNumber tag), e.g. 2.8 for f/2.8. */
  @Column({ type: 'real', nullable: true })
  aperture: number | null;

  @Index('IDX_photo_lens_aperture_scanned')
  @Column({ type: 'boolean', default: false })
  lensApertureScanned: boolean;

  /**
   * Stamped the first time lens/aperture EXIF extraction has been attempted
   * for this photo (whether or not the tags were actually present) —
   * distinguishes "no lens/aperture EXIF in this photo" from "imported
   * before this feature existed, never checked yet", mirroring
   * locationCheckedAt/locationScanned above.
   */
  @Column({ type: 'datetime', nullable: true })
  lensApertureCheckedAt: Date | null;

  @Column({ type: 'real', nullable: true })
  gpsLatitude: number | null;

  @Column({ type: 'real', nullable: true })
  gpsLongitude: number | null;

  /** Reverse-geocoded from gpsLatitude/gpsLongitude — null if the photo has no GPS EXIF data. */
  @Column({ type: 'text', nullable: true })
  locationCity: string | null;

  @Column({ type: 'text', nullable: true })
  locationCountry: string | null;

  @Index('IDX_photo_location_scanned')
  @Column({ type: 'boolean', default: false })
  locationScanned: boolean;

  /**
   * Stamped the first time GPS/location extraction has been attempted for
   * this photo (whether or not it actually found GPS data) — distinguishes
   * "no GPS in this photo" from "imported before this feature existed, never
   * checked yet", which is exactly what the location-backfill action targets.
   */
  @Column({ type: 'datetime', nullable: true })
  locationCheckedAt: Date | null;

  /**
   * Absolute path to the resized display-resolution JPEG, or null if it
   * hasn't been generated yet — cache generation is lazy (triggered by
   * MediaController on first request), not done eagerly at scan/import
   * time, so most of the library never touches disk until it's actually
   * about to be shown.
   */
  @Column({ type: 'text', nullable: true })
  cachedDisplayPath: string | null;

  /** Compatibility mode used to create cachedDisplayPath for a video. */
  @Column({ type: 'text', nullable: true })
  cachedVideoMode: string | null;

  /** When cachedDisplayPath was generated — drives cache eviction timing. */
  @Index()
  @Column({ type: 'datetime', nullable: true })
  cachedAt: Date | null;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  lastShownAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
