/** 教程步骤 */
export interface TutorialStep {
  title: string;
  description: string;
  image?: string;
  tips?: string[];
}

/** 教程定义 */
export interface Tutorial {
  id: string;
  title: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: string;
  steps: TutorialStep[];
  videoUrl?: string;
  faqs?: { question: string; answer: string }[];
  tags: string[];
}

/** 分类定义 */
export interface TutorialCategory {
  key: string;
  label: string;
  icon: React.ReactNode;
}
