import { MarkdownView, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { supermemo, SuperMemoGrade } from 'supermemo';
import { OpenWordsSettingTab } from './settings';
import { LearningTypeModal } from './modals/LearningTypeModal';
import { CardInfo } from './card';
import posTagger from 'wink-pos-tagger';


// 插件设置
interface OpenWordsSettings {
    folderPath: string; // 用户指定的单词文件夹路径
    indexPath: string; // 用户指定的索引文件夹路径
    enableWords1: boolean;
    enableWords2: boolean;
    enableWords3: boolean;
    enableWords4: boolean;
    enableWords5: boolean;
    enableWords6: boolean;
    enableWords7: boolean;
    enableWords8: boolean;
}

// 默认设置
const DEFAULT_SETTINGS: OpenWordsSettings = {
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
}


// 插件主类
export default class OpenWords extends Plugin {
    settings: OpenWordsSettings;  // 插件设置
    settingsSnapshot: OpenWordsSettings;  // 插件设置快照
    statusBarItem: HTMLElement;  // 状态栏元素
    allCards: Map<string, CardInfo> = new Map(); // 存储所有单词的元数据
    masterCards: Map<string, CardInfo> = new Map(); // 存储掌握单词的元数据
    enabledCards: Map<string, CardInfo> = new Map(); // 存储作用域单词的元数据
    newCards: Map<string, CardInfo> = new Map(); // 存储新单词的元数据
    dueCards: Map<string, CardInfo> = new Map(); // 存储旧单词的元数据
    tagger = new posTagger();  // 词性标注器实例

    // 插件加载时执行的操作
    async onload() {
        // 加载插件设置参数, 状态栏, 设置选项卡, 左侧工具栏按钮
        await this.loadSettings();
        this.statusBarItem = this.addStatusBarItem();
        this.addSettingTab(new OpenWordsSettingTab(this.app, this));
        this.addRibbonIcon('slack', 'OpenWords', async () => {
            new LearningTypeModal(this.app, this).open();
        });

        // 等待布局完成
        this.app.workspace.onLayoutReady(async () => {
            // 学习模式命令
            this.addCommand({
                id: 'LearningTypeModal',
                name: '学习模式',
                callback: () => {
                    new LearningTypeModal(this.app, this).open();
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
            // 监听单词文件创建事件
            this.registerEvent(this.app.vault.on("create", (file: TFile) => {
                if (file.path.endsWith(".md") && file.path.startsWith(this.settings.folderPath)) {
                    this.loadWordMetadata(file);
                }
            }));
            // 监听单词文件删除事件
            this.registerEvent(this.app.vault.on("delete", (file: TFile) => {
                if (file.path.endsWith(".md") && file.path.startsWith(this.settings.folderPath)) {
                    this.allCards.delete(file.basename);
                    this.masterCards.delete(file.basename);
                    this.enabledCards.delete(file.basename);
                    this.newCards.delete(file.basename);
                    this.dueCards.delete(file.basename);
                this.statusBarItem.setText(`${this.newCards.size} + ${this.dueCards.size} + ${this.allCards.size-this.enabledCards.size} = ${this.allCards.size}`);
                }
            }));
            // 监听单词文件缓存修改事件
            this.registerEvent(this.app.metadataCache.on("changed", (file) => {
                if (file.path.endsWith(".md") && file.path.startsWith(this.settings.folderPath)) {
                    this.loadWordMetadata(file);
                }
            }));
            // 扫描所有单词文件
            await this.scanAllNotes();
        });
    }

    // 加载单词元数据
    async loadWordMetadata(file: TFile) {
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
            return;
        }

        const tags: string[] = frontMatter.tags || [];
        const isMastered = frontMatter["掌握"] === true;
        const isEnabled =
            (this.settings.enableWords1 && tags.includes('级别/小学')) ||
            (this.settings.enableWords2 && tags.includes('级别/中考')) ||
            (this.settings.enableWords3 && tags.includes('级别/高考四级')) ||
            (this.settings.enableWords4 && tags.includes('级别/考研')) ||
            (this.settings.enableWords5 && tags.includes('级别/六级')) ||
            (this.settings.enableWords6 && tags.includes('级别/雅思')) ||
            (this.settings.enableWords7 && tags.includes('级别/托福')) ||
            (this.settings.enableWords8 && tags.includes('级别/GRE'));

        const card: CardInfo = {
            front: file.basename,
            path: file.path,
            dueDate: frontMatter["到期日"],
            interval: frontMatter["间隔"],
            efactor: frontMatter["易记因子"] * 0.01,
            repetition: frontMatter["重复次数"],
            isMastered: isMastered,
        };

        const isMasteredOld = allCards.get(card.front)?.isMastered;
        allCards.set(card.front, card);

        // 再添加新的单词元数据
        if (isEnabled && !isMastered) {
            enabledCards.set(card.front, card);
            if (frontMatter["重复次数"] === 0) {
                newCards.set(card.front, card);
            } else {
                dueCards.set(card.front, card);
            }
        }

		if (isMastered) {
			masterCards.set(card.front, card);
		}

        // 如果掌握状态发生变化，更新复选框
        if (isMastered !== isMasteredOld && isMasteredOld !== undefined) {
            const newCheckbox = isMastered ? 'x' : ' ';
            const oldCheckbox = isMasteredOld ? 'x' : ' ';
            await this.syncMetadataToCheckbox(file, newCheckbox, oldCheckbox);
        }

		this.statusBarItem.setText(`${this.newCards.size} + ${this.dueCards.size} + ${this.allCards.size-this.enabledCards.size} = ${this.allCards.size}`);
    }

    // 扫描所有单词文件
    async scanAllNotes() {
        this.allCards.clear();
        this.enabledCards.clear();
        this.newCards.clear();
        this.dueCards.clear();
        const files = this.app.vault.getMarkdownFiles();
        const filteredFiles = files.filter(file => file.path.startsWith(this.settings.folderPath));
        if (filteredFiles.length === 0) {
            new Notice('指定的文件夹下没有 Markdown 文件！');
			this.statusBarItem.setText(`${this.newCards.size} + ${this.dueCards.size} + ${this.allCards.size-this.enabledCards.size} = ${this.allCards.size}`);
            return;
        }
        const notice = new Notice('扫描中...', 0); // 创建一个持续显示的 Notice

        await Promise.all(filteredFiles.map(async (file) => {
            await this.loadWordMetadata(file);
            notice.setMessage(`扫描中... ${this.enabledCards.size}/${filteredFiles.length}`); // 更新 Notice 的消息
        }));
        notice.setMessage(`扫描完成！共 ${this.newCards.size} + ${this.dueCards.size} + ${this.allCards.size-this.enabledCards.size} = ${this.allCards.size} 个单词`); // 完成后更新消息
        setTimeout(() => notice.hide(), 2000); // 2 秒后自动隐藏 Notice
    }

    // 更新单词属性
    async updateCard(card: CardInfo, grade: SuperMemoGrade) {
        const result = supermemo(card, grade);
        const newDate = window.moment().add(result.interval, 'day').format('YYYY-MM-DD');
        const file = this.app.vault.getFileByPath(card.path);
        if (!file) {
            new Notice(`文件 ${card.path} 不存在！`);
            return;
        }
        this.newCards.delete(card.front);
        this.dueCards.delete(card.front);
        await this.app.fileManager.processFrontMatter(file, (frontMatter) => {
            frontMatter["到期日"] = newDate;
            frontMatter["间隔"] = result.interval;
            frontMatter["易记因子"] = Math.round(result.efactor * 100);
            frontMatter["重复次数"] = result.repetition;
        });
        new Notice(`${card.front} \n易记因子: ${result.efactor.toFixed(2)} \n重复次数: ${result.repetition} \n间隔: ${result.interval} \n到期日: ${newDate}`);

    }

    // 重置单词属性
    async resetCard() {
        if (this.enabledCards.size === 0) {
            new Notice("没有单词需要重置！");
            return;
        }
        const notice = new Notice('重置中...', 0); // 创建一个持续显示的 Notice
        let count = 0; // 计数器
        const cardList = Array.from(this.enabledCards.values()); // 将 Map 转换为数组
        for (const card of cardList) {
            const file = this.app.vault.getFileByPath(card.path);
            if (!file) {
                new Notice(`文件 ${card.path} 不存在！`);
                continue;
            }
            await this.app.fileManager.processFrontMatter(file, (frontMatter) => {
                frontMatter["到期日"] = window.moment().format('YYYY-MM-DD');
                frontMatter["间隔"] = 0;
                frontMatter["易记因子"] = 250;
                frontMatter["重复次数"] = 0;
            });
            count++; // 增加计数器
            notice.setMessage(`重置中... ${count}/${this.enabledCards.size}`); // 更新 Notice 的消息
        }
        notice.setMessage(`重置完成！共 ${count} 个单词`); // 完成后更新消息
        setTimeout(() => notice.hide(), 2000); // 2 秒后自动隐藏 Notice
    }

    // 建立单词双链
    async addDoubleBrackets() {
        const unmasteredWords = new Set(Array.from(this.enabledCards.values())
            .filter(card => card.efactor <= 2.5)
            .map(card => card.front)
        );
        if (unmasteredWords.size === 0) {
            new Notice("没有单词需要添加双链！");
            return;
        }

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
                    if (!unmasteredWords.has(innerWord)) {
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

    // 生成单词索引
    async generateIndex() {
        const notice = new Notice('索引中...', 0); // 创建一个持续显示的 Notice
        const levels = [
            "级别/小学", "级别/中考", "级别/高考四级", "级别/考研",
            "级别/六级", "级别/雅思", "级别/托福", "级别/GRE"
        ];
        const wordsDir = this.settings.folderPath; // 单词文件夹路径
        const indexDir = this.settings.indexPath; // 索引文件夹路径

        // 创建索引文件夹 (如果不存在)
        const existingIndexFolder = this.app.vault.getFolderByPath(indexDir);
        if (!existingIndexFolder) {
            await this.app.vault.createFolder(indexDir);
        }

        // 遍历所有单词，记录每个单词的级别
        const wordRecords: Record<string, { [letter: string]: string[] }> = {};
        for (const level of levels) {
            wordRecords[level] = {};
        }

        const files = this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(wordsDir));
        for (const file of files) {
            const frontMatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (!frontMatter) continue; // 如果没有 FrontMatter，跳过
            const tags: string[] = frontMatter.tags || [];
            const isMastered = frontMatter["掌握"] === true;
            for (const level of levels) {
                if (tags.includes(level)) {
                    const letter = file.basename[0].toUpperCase(); // 获取单词首字母
                    if (!wordRecords[level][letter]) {
                        wordRecords[level][letter] = [];
                    }
                    if (isMastered)
                        wordRecords[level][letter].push(`- [x] [[${file.basename}]]`);
                    else {
                        wordRecords[level][letter].push(`- [ ] [[${file.basename}]]`);
                    }
                }
            }
        }

        const totalWordsList: Record<string, number> = {}; // 记录每个级别的总单词数
        // 遍历级别，生成索引
        for (const level of levels) {
            const levelName = level.split('/').pop(); // 获取级别名称
            const levelFolderPath = `${indexDir}/${levelName}`;
            const existingLevelFolder = this.app.vault.getFolderByPath(levelFolderPath);
            notice.setMessage(`索引中... ${levelName}`); // 更新 Notice 的消息

            // 如果级别文件夹不存在，则创建
            if (!existingLevelFolder) {
                await this.app.vault.createFolder(levelFolderPath);
            }

            let totalWords = 0; // 统计总单词数
            const letterStats: { letter: string; count: number }[] = []; // 记录每个字母的单词数量

            for (let i = 65; i <= 90; i++) {
                const letter = String.fromCharCode(i);
                const words = wordRecords[level][letter] || []; // 如果没有单词，返回空数组
                words.sort((a, b) => {
                    const extractName = (line: string) => {
                        const match = line.match(/\[\[(.+?)\]\]/);
                        return match ? match[1] : line;
                    };
                    return extractName(a).localeCompare(extractName(b));
                }); // 按字母顺序排序
                totalWords += words.length; // 累加总单词数
                letterStats.push({ letter, count: words.length }); // 添加统计信息

                // 创建或覆盖字母索引文件
                const letterFilePath = `${levelFolderPath}/${levelName}.${letter}.md`;
                const content = words.join('\n');
                await this.writeFile(letterFilePath, `##### ${levelName}.${letter} ${words.length}\n${content}`); // 写入索引文件
            }
            totalWordsList[level] = totalWords; // 记录每个级别的总单词数

            // 生成总索引文件
            const totalIndexFilePath = `${levelFolderPath}/单词索引.${levelName}.md`;
            const totalIndexContent = [
                `##### 单词索引.${levelName} ${totalWords}`,
                `|   首字母   | 数量 |`,
                `| :-------: | --: |`,
                ...letterStats.map(stat => `| [${stat.letter}](${levelName}.${stat.letter}) | ${stat.count} |`)
            ].join('\n');

            await this.writeFile(totalIndexFilePath, totalIndexContent); // 写入索引文件
        }

        // 生成全索引
        const fullIndexFolderPath = `${indexDir}/全索引`;
        notice.setMessage(`索引中... 全索引`); // 更新 Notice 的消息

        const existingFullIndexFolder = this.app.vault.getFolderByPath(fullIndexFolderPath);
        if (!existingFullIndexFolder) {
            await this.app.vault.createFolder(fullIndexFolderPath);
        }

        // 先收集所有字母到一个新的对象
        const allWordsByLetter: Record<string, string[]> = {}; // { A: [...], B: [...], ... }

        for (const levelRecords of Object.values(wordRecords)) {
            for (const [letter, words] of Object.entries(levelRecords)) {
                if (!allWordsByLetter[letter]) {
                    allWordsByLetter[letter] = [];
                }
                allWordsByLetter[letter].push(...words);
            }
        }

        let totalWords = 0;
        const letterStats: { letter: string; count: number }[] = [];

        for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            let words = allWordsByLetter[letter] || []; // 如果没有单词，返回空数组
            words = Array.from(new Set(words)); // 去重
            totalWords += words.length; // 累加总单词数
            letterStats.push({ letter, count: words.length });
            words.sort((a, b) => {
                const extractName = (line: string) => {
                    const match = line.match(/\[\[(.+?)\]\]/);
                    return match ? match[1] : line;
                };
                return extractName(a).localeCompare(extractName(b));
            });

            // 创建或覆盖字母索引文件
            const letterFilePath = `${fullIndexFolderPath}/全索引.${letter}.md`;
            const content = words.join('\n');
            await this.writeFile(letterFilePath, `##### 全索引.${letter} ${words.length}\n${content}`); // 写入索引文件
        }

        // 生成总索引文件
        const totalIndexFilePath = `${fullIndexFolderPath}/单词索引.全索引.md`;
        const totalIndexContent = [
            `##### 单词索引.全索引 ${totalWords}`,
            `|   首字母   | 数量 |`,
            `| :-------: | --: |`,
            ...letterStats.map(stat => `| [${stat.letter}](全索引.${stat.letter}) | ${stat.count} |`)
        ].join('\n');

        await this.writeFile(totalIndexFilePath, totalIndexContent); // 写入索引文件


        const finalIndexPath = `${indexDir}/英语单词.md`;
        // 定义表头
        const header = [
            `##### [[英语单词说明|英语单词]]`,
            ``,
            `|                 | [n.](单词索引.名词) | [v.](单词索引.动词) | [adj.](单词索引.形容词) | [adv.](单词索引.副词) | [prep.](单词索引.介词) | [pron.](单词索引.代词) | [det.](单词索引.限定词) | [conj.](单词索引.连词) |`,
            `| :--------------: | :------------: | :------------: | :---------------: | :--------------: | :---------------: | :---------------: | :---------------: | :---------------: |`,
            `| [全索引](单词索引.全索引) | [小学](单词索引.小学) | [中考](单词索引.中考) | [高四](单词索引.高考四级)  | [考研](单词索引.考研)   | [六级](单词索引.六级)    | [雅思](单词索引.雅思)    | [托福](单词索引.托福)    | [GRE](单词索引.GRE)  |`,
            `| ${this.allCards.size}           | ${totalWordsList["级别/小学"]}           | ${totalWordsList["级别/中考"]}          | ${totalWordsList["级别/高考四级"]}             | ${totalWordsList["级别/考研"]}             | ${totalWordsList["级别/六级"]}             | ${totalWordsList["级别/雅思"]}             | ${totalWordsList["级别/托福"]}             | ${totalWordsList["级别/GRE"]}             |`
        ];

        // 定义字母索引行
        const alphabetRows = [];
        for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            alphabetRows.push(
                `| [${letter}](全索引.${letter})      | [${letter}](小学.${letter})     | [${letter}](中考.${letter})     | [${letter}](高考四级.${letter})      | [${letter}](考研.${letter})       | [${letter}](六级.${letter})        | [${letter}](雅思.${letter})        | [${letter}](托福.${letter})        | [${letter}](GRE.${letter})       |`
            );
        }

        // 合并表头和字母索引行
        const finalContent = [...header, ...alphabetRows].join('\n');
        await this.writeFile(finalIndexPath, finalContent); // 写入索引文件

        notice.setMessage("索引生成完成！");
        setTimeout(() => notice.hide(), 2000); // 2 秒后自动隐藏 Notice
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

    // 监听单词属性变化并同步到复选框状态
    async syncMetadataToCheckbox(file: TFile, newCheckbox: string, oldCheckbox: string) {
        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        const backlinks: Record<string, number> = {};
        for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
            if (links[file.path]) {
                backlinks[sourcePath] = links[file.path];
            }
        }
        for (const [sourcePath, ] of Object.entries(backlinks)) {
            if (sourcePath.startsWith(this.settings.indexPath)) {
                const sourceFile = this.app.vault.getFileByPath(sourcePath)
                if (sourceFile instanceof TFile) {
                    const newWord = `- [${newCheckbox}] [[${file.basename}]]`;
                    const oldWord = `- [${oldCheckbox}] [[${file.basename}]]`;
                    await this.app.vault.process(sourceFile, (data) => data.replace(oldWord, newWord));
                }
            }
        }
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
