import type { Tutorial } from './types';
import { tutorialsBasic } from './tutorialDataBasic';
import { tutorialsSystem } from './tutorialDataSystem';

/** 全部教程数据 */
export const tutorials: Tutorial[] = [
  ...tutorialsBasic,
  ...tutorialsSystem,
];

export default tutorials;
