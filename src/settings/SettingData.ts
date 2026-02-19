import { normalizePath } from "obsidian";


// OpenWords 插件设置接口
export interface OpenWordsSettings {
    folderPath: string;
    indexPath: string;
    enabledTags: string[];  // 用户选择的标签列表
    tagHistory: string[];   // 标签输入历史记录
    randomRatio: number;
    maxEfactorForLink: number;
}


// OpenWords 插件默认设置
export const DEFAULT_SETTINGS: OpenWordsSettings = {
    folderPath: normalizePath(""),
    indexPath: normalizePath("索引"),
    enabledTags: [
        "级别/小学",
        "级别/中考",
        "级别/高考四级",
        "级别/考研",
        "级别/六级",
        "级别/雅思",
        "级别/托福",
        "级别/GRE",
    ],
    tagHistory: [
        "级别/小学",
        "级别/中考",
        "级别/高考四级",
        "级别/考研",
        "级别/六级",
        "级别/雅思",
        "级别/托福",
        "级别/GRE",
    ],
    randomRatio: 0.7,
    maxEfactorForLink: 2.6,
};
