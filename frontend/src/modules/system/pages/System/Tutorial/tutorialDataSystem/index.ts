import type { Tutorial } from '../types';

import { tutorialsGettingStarted } from './gettingStarted';
import { tutorialsProduction } from './production';
import { tutorialsWarehouse } from './warehouse';
import { tutorialsFinance } from './finance';
import { tutorialsSystem as systemTutorials } from './system';

export const tutorialsSystem: Tutorial[] = [
  ...tutorialsGettingStarted,
  ...tutorialsProduction,
  ...tutorialsWarehouse,
  ...tutorialsFinance,
  ...systemTutorials,
];
