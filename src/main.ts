import { EventRef, MarkdownView, Notice, Plugin, TFile, TFolder, Vault } from 'obsidian';
import { OpenWordsSettings, DEFAULT_SETTINGS } from "./settings/SettingData";
import { OpenWordsSettingTab } from './settings/SettingTab';
import { MainView, MAIN_VIEW, PageType } from './views/MainView';
import { CardInfo } from './utils/Card';
import { supermemo, SuperMemoGrade } from 'supermemo';
import posTagger from 'wink-pos-tagger';


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


    // 插件加载时执行的操作
    async onload() {
        // 加载插件设置参数, 设置选项卡, 左侧工具栏按钮, 注册主视图
        await this.loadSettings();
        this.addSettingTab(new OpenWordsSettingTab(this.app, this));
        this.addRibbonIcon('slack', 'OpenWords', async () => { await this.activateView(); });
        this.registerView(MAIN_VIEW, (leaf) => new MainView(leaf, this));

        // 等待布局完成
        this.app.workspace.onLayoutReady(async () => {
            // 激活视图命令
            this.addCommand({
                id: 'LearningTypeModal',
                name: '学习视图',
                callback: () => {
                    this.activateView();
                }
            });
            // 添加双链命令
            this.addCommand({
                id: 'addDoubleBrackets',
                name: '添加双链',
                editorCallback: () => {
                    this.addDoubleBrackets();
                }
            });
            // 注册文件监听器
            this.registerFileWatchers();
            // 扫描所有单词文件, 更新状态栏
            await this.scanAllNotes();
            this.updateStatusBar();
        });
    }

    // 激活视图
    async activateView() {
        const leaves = this.app.workspace.getLeavesOfType(MAIN_VIEW);

        if (leaves.length === 0) {
            await this.app.workspace.getLeaf(true).setViewState({
                type: MAIN_VIEW,
                active: true,
            });
        } else {
            const leaf = leaves[0];
            if (leaf) {
                await this.app.workspace.revealLeaf(leaf);
            }
        }
    }

    // 加载单词元数据
    async loadWordMetadata(file: TFile, single = true) {
        const allCards = this.allCards;
		const masterCards = this.masterCards;
        const enabledCards = this.enabledCards;
        const newCards = this.newCards;
        const dueCards = this.dueCards;

        // 先删除旧的单词元数据
		masterCards.delete(file.basename);
        enabledCards.delete(file.basename);
        newCards.delete(file.basename);
        dueCards.delete(file.basename);

        // 从 metadataCache 获取文件的 FrontMatter
        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontMatter = fileCache?.frontmatter;

        // 如果文件没有 FrontMatter，直接返回
        if (!frontMatter) {
            allCards.delete(file.basename);
            if (single) { this.updateStatusBar(); }
            return;
		}

        const tags: string[] = frontMatter.tags || [];
        const isMastered = frontMatter["掌握"] === true;
        const isTagged = tags.some(tag => this.settings.enabledTags.includes(tag));

        const card: CardInfo = {
            front: file.basename,
            path: file.path,
            dueDate: frontMatter["到期日"],
            interval: frontMatter["间隔"],
            efactor: frontMatter["易记因子"] * 0.01,
            repetition: frontMatter["重复次数"],
            isMastered: isMastered,
        };
        if (
            !card.front ||
            !card.path ||
            card.dueDate === undefined ||
            card.interval === undefined ||
            card.efactor === undefined ||
            card.repetition === undefined ||
            Number.isNaN(card.efactor) ||
            Number.isNaN(card.interval) ||
            Number.isNaN(card.repetition)
        ) {
            allCards.delete(file.basename);
            if (single) { this.updateStatusBar(); }
            return;
        }

		// 更新所有单词
		allCards.set(card.front, card);

		// 更新掌握单词
		if (isMastered) {
			masterCards.set(card.front, card);
		}

        // 更新启用单词, 新单词, 旧单词
        if (isTagged && !isMastered) {
            enabledCards.set(card.front, card);
            if (frontMatter["重复次数"] === 0) {
                newCards.set(card.front, card);
            } else {
                dueCards.set(card.front, card);
            }
        }

        // 如果是单个文件更新状态栏
        if (single) { this.updateStatusBar(); }
    }

    // 扫描所有单词文件
    async scanAllNotes() {
        this.allCards.clear();
		this.masterCards.clear();
        this.enabledCards.clear();
        this.newCards.clear();
        this.dueCards.clear();
		const normalized = this.settings.folderPath.endsWith("/")
			? this.settings.folderPath
			: this.settings.folderPath + "/";
        const files = this.app.vault.getMarkdownFiles();
        const filteredFiles = files.filter(file => file.path.startsWith(normalized));

        if (filteredFiles.length === 0) {
            new Notice('指定的文件夹下没有 Markdown 文件！');
			this.updateStatusBar()
            return;
        }

        await Promise.all(filteredFiles.map(async (file) => {
            await this.loadWordMetadata(file, false);
        }));
    }

    // 更新单词属性
    async updateCard(card: CardInfo, grade: SuperMemoGrade, mode: PageType) {
        if (
            (mode === 'new' && !this.newCards.has(card.front)) ||
            (mode === 'old' && !this.dueCards.has(card.front))
        ) {
            new Notice(`${card.front} \n不属于本模式范围 \n评分无效并跳过`);
            return;
        }

        const result = supermemo(card, grade);
        const newDate = window.moment().add(result.interval, 'day').format('YYYY-MM-DD');
        const file = this.app.vault.getFileByPath(card.path);

		if (!file) {
            new Notice(`文件 ${card.path} 不存在！`);
            return;
        }

        await this.app.fileManager.processFrontMatter(file, (frontMatter) => {
            frontMatter["到期日"] = newDate;
            frontMatter["间隔"] = result.interval;
            frontMatter["易记因子"] = Math.round(result.efactor * 100);
            frontMatter["重复次数"] = result.repetition;
        });

		new Notice(`${card.front} \n易记因子: ${result.efactor.toFixed(2)} \n重复次数: ${result.repetition} \n间隔: ${result.interval} \n到期日: ${newDate}`);

        // 等待元数据缓存更新（最多等待 1 秒）
        let attempts = 0;
        while (attempts < 5) {
            const updated = this.app.metadataCache.getFileCache(file);
            if (updated?.frontmatter?.["到期日"] === newDate) {
                break; // 缓存已更新
            }
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
        }
    }

    // 重置单词属性
    async resetCard() {
        if (this.enabledCards.size === 0) {
            new Notice("没有单词需要重置！");
            return;
        }
        
        // // 注销监听器，避免重置过程中触发大量缓存更新事件
        // this.unregisterFileWatchers();
        
        const notice = new Notice('重置中...', 0); // 创建一个持续显示的 Notice
        let count = 0; // 计数器
        const cardList = Array.from(this.enabledCards.values()); // 将 Map 转换为数组
        const total = cardList.length;
        const concurrency = 10; // 并发处理数量
        const todayDate = window.moment().format('YYYY-MM-DD'); // 提前计算日期，避免重复计算
        let updateFrequency = Math.max(1, Math.floor(total / 50)); // 减少更新频率到 2%
        
        // 创建并发处理任务
        const processTasks = async () => {
            for (let i = 0; i < cardList.length; i += concurrency) {
                const chunk = cardList.slice(i, i + concurrency);
                await Promise.all(chunk.map(async (card) => {
                    const file = this.app.vault.getFileByPath(card.path);
                    if (file) {
                        await this.app.fileManager.processFrontMatter(file, (frontMatter) => {
                            frontMatter["到期日"] = todayDate;
                            frontMatter["间隔"] = 0;
                            frontMatter["易记因子"] = 250;
                            frontMatter["重复次数"] = 0;
                        });
                    }
                    count++;
                    // 定期更新 Notice，减少 UI 更新频率
                    if (count % updateFrequency === 0 || count === total) {
                        notice.setMessage(`重置中... ${count}/${total}`);
                    }
                }));
            }
        };

        try {
            await processTasks();
            notice.setMessage(`重置完成！共 ${count} 个单词`);
        } catch (error) {
            new Notice(`重置出错: ${error}`);
            console.error('Reset card error:', error);
        } finally {
            // // 重新注册监听器
            // this.registerFileWatchers();
            // // 重新扫描所有单词文件，确保数据同步
            // await this.scanAllNotes();
            // this.updateStatusBar();
            setTimeout(() => notice.hide(), 2000); // 2 秒后自动隐藏 Notice
        }
    }
    
    // 建立单词双链
    async addDoubleBrackets() {
        const unmasteredWords = new Set(Array.from(this.enabledCards.values())
            .filter(card => card.efactor <= this.settings.maxEfactorForLink) // 只选择易记因子小于等于设置值的单词
            .map(card => card.front)
        );

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            const editor = activeView.editor;
            const doc = editor.getDoc();
            const content = doc.getValue(); // 获取当前文档内容
            const words = content.split(/(\[\[.+?\]\]|\s+|\b)/); // 将文本拆分成单词, 保留双链、空格和分隔符
            const updatedWords = words.map((word) => {
                const doubleBracketMatch = word.match(/^\[\[(.+?)(\|(.+?))?\]\]$/); // 检查是否是双链格式 [[名称|别名]]
                if (doubleBracketMatch) { // 如果是双链格式
                    const innerWord = doubleBracketMatch[1]; // 获取双链中的名称
                    const alias = doubleBracketMatch[3]; // 获取双链中的别名
                    // 如果双链中的名称不在单词表中，去除双链，保留别名或名称
                    if (innerWord && !unmasteredWords.has(innerWord)) {
                        return alias; // 如果有别名，保留别名；否则保留名称
                    }
                    // 如果双链中的名称在单词表中，保持原样
                    return word;

                } else { // 如果不是双链格式
                    const doc = this.tagger.tagSentence(word.toLowerCase());
                    const lemma = doc[0]?.lemma ?? word.toLowerCase(); // 获取动词的原形
                    // 检查词干是否在单词表中
                    if (unmasteredWords.has(lemma)) {
                        return `[[${lemma}|${word}]]`; // 如果匹配到单词表中的词干，添加双链
                    }
                    if (unmasteredWords.has(word)) {
                        return `[[${word}|${word}]]`; // 如果匹配到单词表中的词干，添加双链
                    }
                    return word; // 否则返回原始单词
                }
            });
            const updatedContent =  updatedWords.join('');

            doc.setValue(updatedContent); // 用更新后的内容替换原文
            new Notice('已添加双链！');
        }
    }

    // 生成单词索引 .base 文件
    async generateIndex() {
        const notice = new Notice('索引中...', 0);
        
        // 从设置读取标签并转换为配置对象（将多级标签的 '/' 替换为 '.'）
        const levelConfigs = this.settings.enabledTags.map(tag => {
            const name = tag.replace(/\//g, '.');
            return { tag, name };
        });

        const wordsDir = this.settings.folderPath;
        const indexDir = this.settings.indexPath;

        // 创建索引文件夹
        const existingIndexFolder = this.app.vault.getFolderByPath(indexDir);
        if (!existingIndexFolder) {
            await this.app.vault.createFolder(indexDir);
        }

        // 统计每个级别的单词数
        const levelWordCounts: Record<string, number> = {};
        for (const level of levelConfigs) {
            levelWordCounts[level.tag] = 0;
        }

        const folder = this.app.vault.getAbstractFileByPath(wordsDir);
        if (!(folder instanceof TFolder) || wordsDir === "/") {
            notice.setMessage('指定的单词文件夹不存在！');
            setTimeout(() => notice.hide(), 2000);
            return
        };

        Vault.recurseChildren(folder, (file) => {
            if (!(file instanceof TFile) || file.extension !== "md") return;

            const frontMatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (!frontMatter) return;

            const tags: string[] = frontMatter.tags || [];
            for (const level of levelConfigs) {
                if (tags.includes(level.tag)) {
                    levelWordCounts[level.tag] = (levelWordCounts[level.tag] ?? 0) + 1;                }
            }
        });

        // 总单词数
        const totalCount = this.allCards.size;

        // 生成主索引文件
        const mainIndexPath = `${indexDir}/英语单词索引.md`;
        notice.setMessage('索引中... 生成主索引');

        // 构建表格
        const titleRow = '| [[英语单词索引.总计.base#总计\\|总计]] | ' + levelConfigs.map(l => `[[英语单词索引.${l.name}.base#${l.name.split('.').pop()}\\|${l.name.split('.').pop()}]]`).join(' | ') + ' |';
        const separator = '| :---: | ' + levelConfigs.map(() => ':---:').join(' | ') + ' |';
        const countRow = '| ' + totalCount + ' | ' + levelConfigs.map(l => levelWordCounts[l.tag] || 0).join(' | ') + ' |';

        // 字母行
        const letterRows: string[] = [];
        for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const cells = [`[[英语单词索引.总计.base#总计.${letter}\\|${letter}]]`];
            for (const level of levelConfigs) {
                cells.push(`[[英语单词索引.${level.name}.base#${level.name.split('.').pop()}.${letter}\\|${letter}]]`);
            }
            letterRows.push('| ' + cells.join(' | ') + ' |');
        }

        // 合并表格
        const mainContent = [
            titleRow,
            separator,
            countRow,
            ...letterRows
        ].join('\n');

        await this.writeFile(mainIndexPath, '##### 英语单词索引\n\n' + mainContent + '\n\n');

        // 生成总计 .base 配置文件（总计列）
        notice.setMessage('索引中... 生成总计索引');
        const allBasePath = `${indexDir}/英语单词索引.总计.base`;
        const allBaseContent = `filters:
  and:
    - file.folder.startsWith("${wordsDir}")
views:
  - type: table
    name: 总计
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
${Array.from({ length: 26 }, (_, i) => {
    const letter = String.fromCharCode(65 + i);
    return `  - type: table
    name: 总计.${letter}
    filters:
      and:
        - file.basename.startsWith("${letter.toLowerCase()}")
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日`;
}).join('\n')}
`;
        await this.writeFile(allBasePath, allBaseContent);

        // 生成每个级别的 .base 配置文件
        for (const level of levelConfigs) {
            notice.setMessage(`索引中... ${level.name}`);
            const basePath = `${indexDir}/英语单词索引.${level.name}.base`;

            const baseContent = `filters:
  and:
    - file.folder.startsWith("${wordsDir}")
    - file.tags.contains("${level.tag}")
views:
  - type: table
    name: ${level.name.split('.').pop()}
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
${Array.from({ length: 26 }, (_, i) => {
    const letter = String.fromCharCode(65 + i);
    return `  - type: table
    name: ${level.name.split('.').pop()}.${letter}
    filters:
      and:
        - file.basename.startsWith("${letter.toLowerCase()}")
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日`;
}).join('\n')}
`;

            await this.writeFile(basePath, baseContent);
        }

        notice.setMessage('索引生成完成！');
        setTimeout(() => notice.hide(), 2000);
    }

    // 覆盖写入文件
    async writeFile(filePath: string, content: string) {
        const existingFile = this.app.vault.getFileByPath(filePath);
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
        } else {
            await this.app.vault.create(filePath, content);
        }
    }

    // 创建英语单词状态 .base 文件
    async createWordStatusBaseFile() {
        const wordsDir = this.settings.folderPath;
        const indexDir = this.settings.indexPath;
        const enabledTagsList = this.settings.enabledTags;

        // 创建索引文件夹
        const existingIndexFolder = this.app.vault.getFolderByPath(indexDir);
        if (!existingIndexFolder) {
            await this.app.vault.createFolder(indexDir);
        }

        // 构建 enabledTags 的 or 条件
        const tagFilters = enabledTagsList.map(tag => `            - file.tags.contains("${tag}")`).join('\n');

        // 构建 .base 文件内容
        const baseContent = `filters:
  and:
    - file.folder.startsWith("${wordsDir}")
views:
  - type: table
    name: 总计
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 待学习
    filters:
      and:
        - or:
${tagFilters}
        - and:
            - 掌握 == false
        - and:
            - 重复次数 == 0
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 待复习
    filters:
      and:
        - or:
${tagFilters}
        - and:
            - 掌握 == false
        - and:
            - 重复次数 != 0
        - and:
            - 到期日 > today()
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 今日到期
    filters:
      and:
        - or:
${tagFilters}
        - and:
            - 掌握 == false
        - and:
            - 重复次数 != 0
        - and:
            - 到期日 <= today()
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 已掌握
    filters:
      and:
        - and:
            - 掌握 == true
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
  - type: table
    name: 未启用
    filters:
      or:
        - not:
${tagFilters}
        - and:
            - 掌握 == true
    order:
      - 掌握
      - file.name
      - 易记因子
      - 重复次数
      - 间隔
      - 到期日
`;

        // 写入或更新 .base 文件
        const basePath = `${this.settings.indexPath}/英语单词状态.base`;
        await this.writeFile(basePath, baseContent);
    }

    // 更新状态栏
    updateStatusBar(){
        this.app.workspace.getLeavesOfType(MAIN_VIEW).forEach(leaf => {
            const view = leaf.view;
            if (view instanceof MainView) {
                void view.updateStatusBar();
            }
        });
    }

    // 注册文件监听器
    private registerFileWatchers() {
        // 先清理旧的监听器
        this.unregisterFileWatchers();

        // 更新当前监听的文件夹路径
        this.currentFolderPath = this.settings.folderPath.endsWith("/")
            ? this.settings.folderPath
            : this.settings.folderPath + "/";

        // 监听单词文件创建事件
        const createRef = this.app.vault.on("create", (file: TFile) => {
            if (file.path.endsWith(".md") && file.path.startsWith(this.currentFolderPath)) {
                this.loadWordMetadata(file);
            }
        });
        this.fileWatcherRefs.push(createRef);

        // 监听单词文件删除事件
        const deleteRef = this.app.vault.on("delete", (file: TFile) => {
            if (file.path.endsWith(".md") && file.path.startsWith(this.currentFolderPath)) {
                this.allCards.delete(file.basename);
                this.masterCards.delete(file.basename);
                this.enabledCards.delete(file.basename);
                this.newCards.delete(file.basename);
                this.dueCards.delete(file.basename);
                this.updateStatusBar()
            }
        });
        this.fileWatcherRefs.push(deleteRef);

        // 监听单词文件缓存修改事件
        const changedRef = this.app.metadataCache.on("changed", (file) => {
            if (file.path.endsWith(".md") && file.path.startsWith(this.currentFolderPath)) {
                this.loadWordMetadata(file);
            }
        });
        this.fileWatcherRefs.push(changedRef);
    }

    // 注销文件监听器
    private unregisterFileWatchers() {
        this.fileWatcherRefs.forEach(ref => {
            this.app.vault.offref(ref);
            this.app.metadataCache.offref(ref);
        });
        this.fileWatcherRefs = [];
    }

    // 重新初始化文件监听器（供设置改变时调用）
    async reinitializeFileWatchers() {
        this.registerFileWatchers();
    }

	onunload() {
        // 清理文件监听器
        this.unregisterFileWatchers();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
