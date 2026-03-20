import { EventRef, Plugin } from 'obsidian';
import { OpenWordsSettings, DEFAULT_SETTINGS } from "./settings/setting-data";
import { OpenWordsSettingTab } from './settings/setting-tab';
import { OpenWordsView, OPENWORDS_VIEW } from './views/main-view';
import { CardInfo } from './utils/card-info';
import posTagger from 'wink-pos-tagger';
import { activateView, updateStatusBar } from './utils/process';
import { scanAllNotes } from './service/words-manager';
import { registerCommands, registerEditorMenu, registerFileWatchers, unregisterFileWatchers } from './service/register';


// 插件主类
export default class OpenWords extends Plugin {
    settings: OpenWordsSettings;  // 插件设置
    settingsSnapshot: OpenWordsSettings;  // 插件设置快照
    tagger: posTagger = new posTagger();  // 词性标注器实例
    allCards: Map<string, CardInfo> = new Map(); // 所有单词
    masterCards: Map<string, CardInfo> = new Map(); // 掌握单词
    enabledCards: Map<string, CardInfo> = new Map(); // 启用单词
    newCards: Map<string, CardInfo> = new Map(); // 新单词
    dueCards: Map<string, CardInfo> = new Map(); // 旧单词
    currentFolderPath: string = "";  // 当前监听的文件夹路径
    fileWatcherRefs: EventRef[] = [];  // 存储文件监听器的 EventRef 以便注销


    // 插件加载
    async onload() {
        // 加载插件设置参数, 设置选项卡, 左侧工具栏按钮, 注册主视图
        await this.loadSettings();
        this.addSettingTab(new OpenWordsSettingTab(this.app, this));
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        this.addRibbonIcon('slack', 'OpenWords', async () => { await activateView(this.app, OPENWORDS_VIEW); });
        this.registerView(OPENWORDS_VIEW, (leaf) => new OpenWordsView(leaf, this));

        // 等待布局完成
        this.app.workspace.onLayoutReady(async () => {
            // 注册命令, 编辑器菜单, 文件监听器
            registerCommands(this);
            registerEditorMenu(this);
            registerFileWatchers(this);
            // 扫描所有单词文件, 更新状态栏
            await scanAllNotes(this);
            updateStatusBar(this.app, OPENWORDS_VIEW);
        });
    }

    // 插件卸载
    onunload() {
        // 清理文件监听器
        unregisterFileWatchers(this);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<OpenWordsSettings>);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
