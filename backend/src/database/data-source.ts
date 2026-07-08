import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';
import { Source } from '../sources/source.entity';
import { Photo } from '../photos/photo.entity';
import { PhotoAction } from '../photos/photo-action.entity';
import { Settings } from '../settings/settings.entity';
import { QueuedSlide } from '../photos/queued-slide.entity';
import { CalendarAccount } from '../calendar/calendar-account.entity';
import { Calendar } from '../calendar/calendar.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { GoogleOAuthConfig } from '../calendar/google-oauth-config.entity';
import { migrations } from './migrations';

const dataDir =
  process.env.FOTIFY_DATA_DIR ?? join(__dirname, '..', '..', 'data');

export const dataSourceOptions: DataSourceOptions = {
  type: 'better-sqlite3',
  database: join(dataDir, 'fotify.db'),
  entities: [
    Source,
    Photo,
    PhotoAction,
    Settings,
    QueuedSlide,
    CalendarAccount,
    Calendar,
    CalendarEvent,
    GoogleOAuthConfig,
  ],
  migrations,
  synchronize: false,
  migrationsRun: true,
};

export default new DataSource(dataSourceOptions);
