import type { Tutorial } from '../types';

import { tutorialsGettingStarted } from './gettingStarted';
import { tutorialsProduction } from './production';
import { tutorialsWarehouse } from './warehouse';
import { tutorialsFinance } from './finance';
import { tutorialsSystem as systemTutorials } from './system';
import { tutorialsIntelligence } from './intelligence';

export const tutorialsSystem: Tutorial[] = [
  ...tutorialsGettingStarted,
  ...tutorialsProduction,
  ...tutorialsWarehouse,
  ...tutorialsFinance,
  ...systemTutorials,
  // D-513：新增智能运营（AI 巡检）与组合商品教程
  ...tutorialsIntelligence,
];
