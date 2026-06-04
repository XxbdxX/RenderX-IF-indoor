import { RenderStyle, TimeOfDay } from './types';

export const MAX_CONCURRENT_REQUESTS = 5;
export const APP_VERSION = '2.1.00';

export const STYLE_ICONS = {
  [RenderStyle.PHOTOREALISTIC]: 'fa-camera',
  [RenderStyle.COMMERCIAL]: 'fa-building',
  [RenderStyle.MINIMALIST]: 'fa-cube',
  [RenderStyle.WATERCOLOR]: 'fa-palette',
  [RenderStyle.SCANDINAVIAN]: 'fa-tree',
  [RenderStyle.BIOPHILIC]: 'fa-leaf',
};

export const TIME_ICONS = {
  [TimeOfDay.MORNING]: 'fa-coffee',
  [TimeOfDay.DAY]: 'fa-sun',
  [TimeOfDay.OVERCAST]: 'fa-cloud',
  [TimeOfDay.LATE_AFTERNOON]: 'fa-mug-hot',
  [TimeOfDay.DUSK]: 'fa-moon',
  [TimeOfDay.NIGHT]: 'fa-lightbulb',
};

export const STYLE_LABELS = {
    [RenderStyle.PHOTOREALISTIC]: "极致写实",
    [RenderStyle.COMMERCIAL]: "商业氛围",
    [RenderStyle.MINIMALIST]: "现代极简",
    [RenderStyle.WATERCOLOR]: "概念汇报",
    [RenderStyle.SCANDINAVIAN]: "北欧自然",
    [RenderStyle.BIOPHILIC]: "生态绿建"
};

export const TIME_LABELS = {
    [TimeOfDay.MORNING]: "清晨",
    [TimeOfDay.DAY]: "日景",
    [TimeOfDay.OVERCAST]: "阴天",
    [TimeOfDay.LATE_AFTERNOON]: "暖阳",
    [TimeOfDay.DUSK]: "黄昏",
    [TimeOfDay.NIGHT]: "夜景"
};
