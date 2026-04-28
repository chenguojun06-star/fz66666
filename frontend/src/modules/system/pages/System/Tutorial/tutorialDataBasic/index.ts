import type { Tutorial } from '../types';

import { tutorialsBasicProduction } from './production';
import { tutorialsBasicMobile } from './mobile';
import { tutorialsBasicWarehouse } from './warehouse';
import { tutorialsBasicFinance } from './finance';
import { tutorialsBasicSample } from './sample';
import { tutorialsBasicSystem } from './system';

export const tutorialsBasic: Tutorial[] = [
  ...tutorialsBasicProduction,
  ...tutorialsBasicMobile,
  ...tutorialsBasicWarehouse,
  ...tutorialsBasicFinance,
  ...tutorialsBasicSample,
  ...tutorialsBasicSystem,
];
