import { normalizePath } from "obsidian";


// OpenWords 插件设置接口
export interface OpenWordsSettings {
    folderPath: string;
    indexPath: string;
    enableWords1: boolean;
    enableWords2: boolean;
    enableWords3: boolean;
    enableWords4: boolean;
    enableWords5: boolean;
    enableWords6: boolean;
    enableWords7: boolean;
    enableWords8: boolean;
    randomRatio: number;
    maxEfactorForLink: number;
}


// OpenWords 插件默认设置
export const DEFAULT_SETTINGS: OpenWordsSettings = {
    folderPath: normalizePath(""),
    indexPath: normalizePath("索引"),
    enableWords1: false,
    enableWords2: false,
    enableWords3: false,
    enableWords4: false,
    enableWords5: false,
    enableWords6: false,
    enableWords7: false,
    enableWords8: false,
    randomRatio: 0.7,
    maxEfactorForLink: 2.6,
};
