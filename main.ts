import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, TFile, Setting, MarkdownRenderer, normalizePath } from 'obsidian';
import { supermemo, SuperMemoItem, SuperMemoGrade } from 'supermemo';
import posTagger from 'wink-pos-tagger';
import dayjs from "dayjs";


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

// 单词卡片信息
interface CardInfo  extends SuperMemoItem {
	front: string;
	dueDate: string;
	path: string;
	isMastered: boolean;
}

// 插件主类
export default class OpenWords extends Plugin {
	settings: OpenWordsSettings;  // 插件设置
	settingsSnapshot: OpenWordsSettings;  // 插件设置快照
	statusBarItem: HTMLElement;  // 状态栏元素
	allCards: Map<string, CardInfo> = new Map(); // 存储所有单词的元数据
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
				callback: () => {
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
					this.enabledCards.delete(file.basename);
					this.newCards.delete(file.basename);
					this.dueCards.delete(file.basename);
				this.statusBarItem.setText(`${this.newCards.size} + ${this.dueCards.size} = ${this.enabledCards.size}`);
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
		const enabledCards = this.enabledCards;
		const newCards = this.newCards;
		const dueCards = this.dueCards;

		// 先删除旧的单词元数据
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

		// 如果掌握状态发生变化，更新复选框
		if (isMastered !== isMasteredOld && isMasteredOld !== undefined) {
			const newCheckbox = isMastered ? 'x' : ' ';
			const oldCheckbox = isMasteredOld ? 'x' : ' ';
			await this.syncMetadataToCheckbox(file, newCheckbox, oldCheckbox);
		}

		this.statusBarItem.setText(`${this.newCards.size} + ${this.dueCards.size} = ${this.enabledCards.size}`);
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
			this.statusBarItem.setText(`${this.newCards.size} + ${this.dueCards.size} = ${this.enabledCards.size}`);
			return;
		}
		const notice = new Notice('缓存中...', 0); // 创建一个持续显示的 Notice

		await Promise.all(filteredFiles.map(async (file) => {
			await this.loadWordMetadata(file);
			notice.setMessage(`缓存中... ${this.enabledCards.size}/${filteredFiles.length}`); // 更新 Notice 的消息
		}));
		notice.setMessage(`缓存完成！共 ${this.enabledCards.size} 个单词`); // 完成后更新消息
		setTimeout(() => notice.hide(), 2000); // 2 秒后自动隐藏 Notice
	}

	// 更新单词属性
	async updateCard(card: CardInfo, grade: SuperMemoGrade) {
		const result = supermemo(card, grade);
		const newDate = dayjs().add(result.interval, 'day').format('YYYY-MM-DD');
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
				frontMatter["到期日"] = dayjs().format('YYYY-MM-DD');
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
			await this.app.vault.process(existingFile, () => content);
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

// 插件设置选项卡
class OpenWordsSettingTab extends PluginSettingTab {
	plugin: OpenWords;

	constructor(app: App, plugin: OpenWords) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		const textContainer = containerEl.createDiv({ cls: 'openwords-text-grid' });
		const toggleContainer = containerEl.createDiv({ cls: 'openwords-toggle-grid' });
		this.plugin.settingsSnapshot = Object.assign({}, this.plugin.settings); // 创建设置快照
		new Setting(textContainer)
			.setName('单词文件夹路径')
			.setDesc('指定存放单词文件的文件夹路径，默认为仓库:/')
			.addText(text => text
				.setValue(this.plugin.settings.folderPath)
				.onChange(async (value) => {
					this.plugin.settingsSnapshot.folderPath  = normalizePath(value);
				}));
		new Setting(textContainer)
			.setName('索引文件夹路径')
			.setDesc('指定存放索引文件的文件夹路径，默认为仓库:索引')
			.addText(text => text
				.setValue(this.plugin.settings.indexPath)
				.onChange(async (value) => {
					this.plugin.settingsSnapshot.indexPath  = normalizePath(value);
				}));
        new Setting(toggleContainer)
            .setName('小学')
            .setDesc('启用小学单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords1)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords1 = value;
                }));
		new Setting(toggleContainer)
            .setName('中考')
            .setDesc('启用中考单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords2)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords2 = value;
                }));
		new Setting(toggleContainer)
            .setName('高四')
            .setDesc('启用高四单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords3)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords3 = value;
                }));
		new Setting(toggleContainer)
            .setName('考研')
            .setDesc('启用考研单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords4)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords4 = value;
                }));
		new Setting(toggleContainer)
            .setName('六级')
            .setDesc('启用六级单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords5)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords5 = value;
                }));
		new Setting(toggleContainer)
            .setName('雅思')
            .setDesc('启用雅思单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords6)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords6 = value;
                }));
		new Setting(toggleContainer)
            .setName('托福')
            .setDesc('启用托福单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords7)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords7 = value;
                }));
		new Setting(toggleContainer)
            .setName('GRE')
            .setDesc('启用GRE单词')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWords8)
                .onChange(async (value) => {
                    this.plugin.settingsSnapshot.enableWords8 = value;
                }));
		new Setting(containerEl)
			.setName('应用设置并缓存')
			.setDesc('保存设置并重新缓存单词状态')
			.addButton(button => button
				.setButtonText('应用')
				.setCta() // 设置为主要按钮样式
				.onClick(async () => {
					if (button.disabled) return; // 如果按钮已禁用，直接返回

					button.setDisabled(true); // 禁用按钮
					button.setButtonText('处理中...'); // 更新按钮文本

					try {
						this.plugin.settings = {...this.plugin.settingsSnapshot}; // 更新插件设置
						await this.plugin.saveSettings(); // 保存设置
						await this.plugin.scanAllNotes(); // 重新缓存单词

					} catch (error) {
						console.error('缓存过程中发生错误:', error);
						new Notice('缓存失败，请检查控制台日志！');
					} finally {
						button.setDisabled(false); // 重新启用按钮
						button.setButtonText('应用'); // 恢复按钮文本
					}
				}));
		new Setting(containerEl)
			.setName('生成索引')
			.setDesc('按级别生成所有单词的首字母索引文件')
			.addButton(button => button
				.setButtonText('生成')
				.onClick(async () => {
					if (button.disabled) return; // 如果按钮已禁用，直接返回

					button.setDisabled(true); // 禁用按钮
					button.setButtonText('处理中...'); // 更新按钮文本

					try {
						await this.plugin.generateIndex(); // 生成索引文件
					} catch (error) {
						console.error('生成索引过程中发生错误:', error);
						new Notice('生成索引失败，请检查控制台日志！');
					} finally {
						button.setDisabled(false); // 重新启用按钮
						button.setButtonText('生成'); // 恢复按钮文本
					}
				}));
		new Setting(containerEl)
			.setName('重置单词属性')
			.setDesc('重置作用域单词的易记因子、重复次数、间隔和到期日')
			.addButton(button => button
				.setButtonText('重置')
				.onClick(async () => {
					if (button.disabled) return; // 如果按钮已禁用，直接返回

					button.setDisabled(true); // 禁用按钮
					button.setButtonText('处理中...'); // 更新按钮文本

					try {
						await this.plugin.resetCard(); // 重置单词属性
					} catch (error) {
						console.error('重置过程中发生错误:', error);
						new Notice('重置失败，请检查控制台日志！');
					} finally {
						button.setDisabled(false); // 重新启用按钮
						button.setButtonText('重置'); // 恢复按钮文本
					}
				}));
	}
}

// 学习模式模态框
class LearningTypeModal extends Modal {
	plugin: OpenWords;

	constructor(app: App, plugin: OpenWords) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		this.modalEl.addClass('type-modal'); // 添加自定义样式类
		const { contentEl } = this;
		contentEl.empty();

        contentEl.createDiv({ cls: 'type-title', text: '选择学习模式' });
		const buttonContainer = contentEl.createDiv({ cls: 'type-button-grid' });

		new Setting(buttonContainer)
			.setName(`学习新词 ( 重复次数为零, 剩余 ${this.plugin.newCards.size} )`)
			.addButton(btn => btn
				.setButtonText("开始")
				.onClick(() => {
					if (this.plugin.newCards.size > 0) {
					this.close();
					new LearningModal(this.app, this.plugin, 'new').open();
					} else {
					new Notice("没有新词可学了！");
					}
			}));

		new Setting(buttonContainer)
			.setName(`复习旧词 ( 重复次数不为零, 剩余 ${this.plugin.dueCards.size} )`)
			.addButton(btn => btn
				.setButtonText("开始")
				.onClick(() => {
					if (this.plugin.dueCards.size > 0) {
					this.close();
					new LearningModal(this.app, this.plugin, 'review').open();
					} else {
					new Notice("没有需要复习的卡片！");
					}
			}));

		new Setting(buttonContainer)
			.setName(`掌握列表 ( 所有单词 )`)
			.addButton(btn => btn
				.setButtonText("开始")
				.onClick(() => {
					this.close();
					new WordListModal(this.app, this.plugin).open();
			}));

		new Setting(buttonContainer)
			.setName('默写单词 ( 作用域单词 )')
			.addButton(btn => btn
				.setButtonText('开始')
				.onClick(() => {
					this.close();
					new SpellingModal(this.app, this.plugin).open();
			}));

		new Setting(buttonContainer)
			.setName(`添加双链 ( 作用域中易记因子 <= 2.5 )`)
			.addButton(btn => btn
				.setButtonText("开始")
				.onClick(async () => {
					this.close();
					await this.plugin.addDoubleBrackets();
				}));
	}
}

// 背单词模态框
class LearningModal extends Modal {
	plugin: OpenWords;
	mode: 'new' | 'review';
	currentCard: CardInfo;

	constructor(app: App, plugin: OpenWords, mode: 'new' | 'review') {
		super(app);
		this.plugin = plugin;
		this.mode = mode;
	}

	onOpen() {
		this.pickNextCard();
		this.render();

		// 监听数字键 0-5 的按键事件
		const handleKeydown = async (event: KeyboardEvent) => {
			if (event.key >= '0' && event.key <= '5') {
				const grade = parseInt(event.key) as SuperMemoGrade;
				await this.rateCard(grade);
			}
		};

		window.addEventListener('keydown', handleKeydown);

		// 在模态框关闭时移除事件监听器
		this.onClose = () => {
			window.removeEventListener('keydown', handleKeydown);
			const { contentEl } = this;
			contentEl.empty();
		};
	}

	pickNextCard() {
		const now = dayjs(); // 获取当前时间
		let pool: CardInfo[];

		// 新词池是指所有新词, 旧词池是指所有已过期的旧词
		if (this.mode === 'new') {
            pool = Array.from(this.plugin.newCards.values()); // 将 Set 转换为数组
			if (pool.length === 0) {
				this.close();
				new Notice("已完成所有新词！");
				return;
			}
		} else {
            pool = Array.from(this.plugin.dueCards.values())
				.filter(card => dayjs(card.dueDate).isBefore(now)) // 筛选已过期的单词
			if (pool.length === 0) {
				this.close();
				new Notice("没有需要复习的卡片！");
				return;
			}
		}
		// 单词调度 70% 纯随机, 30% 从易记因子和重复次数最低的 20% 中随机
		const randomMode = Math.random() < 0.7;
		if (randomMode) {
			this.currentCard = pool[Math.floor(Math.random() * pool.length)];
		} else {
			const sortedPool = pool.sort((a, b) => {
				const efactorDiff = (a.efactor || 1) - (b.efactor || 1); // 易记因子升序
				if (efactorDiff !== 0) return efactorDiff;
				return a.repetition - b.repetition; // 重复次数升序
			});
			const halfPool = sortedPool.slice(0, Math.ceil(sortedPool.length / 5)); // 取前 20%
			this.currentCard = halfPool[Math.floor(Math.random() * halfPool.length)];
		}
	}

	render() {
		const { contentEl } = this;
		contentEl.empty();

		if (!this.currentCard) return;

		// 创建卡片容器并固定样式
		const cardContainer = contentEl.createDiv({ cls: 'anki-card' });

		// 标记当前是否显示 Markdown 内容
		let isShowingMarkdown = false;
		// 初始显示单词
		const wordContent = cardContainer.createDiv({ cls: 'anki-card-content' });
		wordContent.textContent = this.currentCard.front;

		// 添加鼠标悬浮事件切换内容
		cardContainer.addEventListener('mouseenter', async () => {
			if (isShowingMarkdown) return; // 如果已经显示 Markdown 内容，则不重复加载

			const file = this.plugin.app.vault.getFileByPath(this.currentCard.path);
			if (file instanceof TFile) {
				const markdownContent = await this.plugin.app.vault.read(file);

				// 清空卡片内容并渲染 Markdown 内容
				cardContainer.empty();
				const markdownRenderContainer = cardContainer.createDiv({ cls: 'anki-markdown-content' });
				await MarkdownRenderer.render(
					this.app,
					markdownContent,
					markdownRenderContainer,
					file.path,
					this.plugin
				);

				isShowingMarkdown = true;
			} else {
				new Notice('无法加载单词的 Markdown 文件！');
			}
		});

		cardContainer.addEventListener('mouseleave', () => {
			if (!isShowingMarkdown) return; // 如果已经显示单词内容，则不重复加载

			// 切换回显示单词
			cardContainer.empty();
			const wordContent = cardContainer.createDiv({ cls: 'anki-card-content' });
			wordContent.textContent = this.currentCard.front;
			isShowingMarkdown = false;
		});

		const settingsContainer = contentEl.createDiv({ cls: 'anki-settings' });

		new Setting(settingsContainer)
			.setName(`评分 0: 回答错误, 完全不会`)
			.addButton(btn => btn
				.setButtonText('0')
				.onClick(() => this.rateCard(0 as SuperMemoGrade)))
		new Setting(settingsContainer)
			.setName(`评分 1: 回答错误, 看到正确答案后感觉很熟悉`)
			.addButton(btn => btn
				.setButtonText('1')
				.onClick(() => this.rateCard(1 as SuperMemoGrade)))
		new Setting(settingsContainer)
			.setName(`评分 2: 回答错误, 看到正确答案后感觉很容易记住`)
			.addButton(btn => btn
				.setButtonText('2')
				.onClick(() => this.rateCard(2 as SuperMemoGrade)))
		new Setting(settingsContainer)
			.setName(`评分 3: 回答正确, 需要花费很大力气才能回忆起来`)
			.addButton(btn => btn
				.setButtonText('3')
				.onClick(() => this.rateCard(3 as SuperMemoGrade)))
		new Setting(settingsContainer)
			.setName(`评分 4: 回答正确, 需要经过一番犹豫才做出反应`)
			.addButton(btn => btn
				.setButtonText('4')
				.onClick(() => this.rateCard(4 as SuperMemoGrade)))
		new Setting(settingsContainer)
			.setName(`评分 5: 回答正确, 完美响应`)
			.addButton(btn => btn
				.setButtonText('5')
				.onClick(() => this.rateCard(5 as SuperMemoGrade)))
	}

	async rateCard(grade: SuperMemoGrade) {
		await this.plugin.updateCard(this.currentCard, grade);
		this.pickNextCard();
		this.render();
	}

}

// 单词列表模态框
class WordListModal extends Modal {
    plugin: OpenWords;
    selectedLetter: string | null = null; // 当前选中的首字母
    selectedLevel: string | null = null; // 当前选中的级别

    constructor(app: App, plugin: OpenWords) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
		this.modalEl.addClass('word-list-modal');
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createDiv({ cls: 'word-list-title', text: '掌握列表' });
        const filterContainer = contentEl.createDiv({ cls: 'word-list-filters' });
        const listContainer = contentEl.createDiv({ cls: 'word-list-container' });

        // 添加首字母筛选
        new Setting(filterContainer)
            .setName('首字母筛选')
            .addDropdown(dropdown => {
                dropdown.addOption('', '全部');
                for (let i = 65; i <= 90; i++) {
                    const letter = String.fromCharCode(i);
                    dropdown.addOption(letter, letter);
                }
                dropdown.setValue(this.selectedLetter || '');
                dropdown.onChange(value => {
                    this.selectedLetter = value || null;
                    this.renderWordList(listContainer);
                });
            });

        // 添加级别筛选
        new Setting(filterContainer)
            .setName('级别筛选')
            .addDropdown(dropdown => {
                dropdown.addOption('', '全部');
                const levels = [
                    '级别/小学', '级别/中考', '级别/高考四级', '级别/考研',
                    '级别/六级', '级别/雅思', '级别/托福', '级别/GRE'
                ];
                levels.forEach(level => dropdown.addOption(level, level.split('/')[1]));
                dropdown.setValue(this.selectedLevel || '');
                dropdown.onChange(value => {
                    this.selectedLevel = value || null;
                    this.renderWordList(listContainer);
                });
            });

        // 初始不渲染单词列表
        listContainer.createDiv({ text: '请选择筛选条件以查看单词列表。' });
    }

    renderWordList(container: HTMLElement) {
        container.empty();

        // 如果没有选择筛选条件，则不渲染内容
        if (!this.selectedLetter && !this.selectedLevel) {
            container.createDiv({ text: '请选择筛选条件以查看单词列表。' });
            return;
        }


        // 根据筛选条件过滤单词
        const filteredWords = Array.from(this.plugin.allCards.values()).filter(card => {

			const file = this.plugin.app.vault.getFileByPath(card.path);
			if (file instanceof TFile) {
				const matchesLetter = this.selectedLetter
					? card.front.startsWith(this.selectedLetter.toLowerCase())
					: true;
				const matchesLevel = this.selectedLevel
					? this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.tags?.includes(this.selectedLevel)
					: true;
				return matchesLetter && matchesLevel;
			}
        }).sort((a, b) => a.front.localeCompare(b.front)); // 按字母顺序排序

        // 渲染单词列表
        if (filteredWords.length === 0) {
            container.createDiv({ text: '没有符合条件的单词。' });
            return;
        }

        filteredWords.forEach(card => {
			const wordItem = container.createDiv({ cls: 'word-list-item' });
			// 左侧显示单词
			const wordText = wordItem.createDiv({ cls: 'word-text', text: card.front });
			const toggleContainer = wordItem.createDiv({ cls: 'toggle-container' });

            new Setting(toggleContainer)
                // .setName(card.front)
                .addToggle(toggle => {
                    toggle.setValue(card.isMastered) // 设置初始复选框状态
                        .onChange(async (value) => {
							const file = this.plugin.app.vault.getFileByPath(card.path);
							if (!(file instanceof TFile)) return; // 如果文件不存在，直接返回
                            // 更新单词的掌握状态
                            await this.plugin.app.fileManager.processFrontMatter(
                                file, (frontMatter) => {frontMatter["掌握"] = value;}
                            );
                            new Notice(`单词 "${card.front}" 已更新为 ${value ? '掌握' : '未掌握'}`);
                        });
                });
			// 创建 Markdown 预览容器
			const previewContainer = wordText.createDiv({ cls: 'word-preview-inline' });

			// 添加鼠标悬停事件以渲染 Markdown 内容
			wordText.addEventListener('mouseenter', async () => {
				const file = this.plugin.app.vault.getFileByPath(card.path);
				if (file instanceof TFile) {
					const markdownContent = await this.plugin.app.vault.read(file);
					previewContainer.empty();
					await MarkdownRenderer.render(
						this.app,
						markdownContent,
						previewContainer,
						file.path,
						this.plugin
					);
				}
			});

			// 鼠标离开时清空预览内容
			wordText.addEventListener('mouseleave', () => {
				previewContainer.empty();
			});
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 默写单词模态框
class SpellingModal extends Modal {
    plugin: OpenWords;
    currentCard: CardInfo | null = null;

    constructor(app: App, plugin: OpenWords) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('spelling-modal'); // 添加样式类

        const title = contentEl.createDiv({ cls: 'spelling-title', text: '默写单词' });
        const wordMeaningContainer = contentEl.createDiv({ cls: 'word-meaning-container' });
        const inputContainer = contentEl.createDiv({ cls: 'input-container' });
        const feedbackContainer = contentEl.createDiv({ cls: 'feedback-container' });

        // 初始化第一个单词
        await this.pickNextCard(wordMeaningContainer, inputContainer, feedbackContainer);

		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Tab') {
				event.preventDefault(); // 阻止页面滚动
				if (this.currentCard) {
					title.setText(`${this.currentCard.front}`); // 显示答案
				}
			}
		};

		const handleKeyup = (event: KeyboardEvent) => {
			if (event.key === 'Tab') {
				event.preventDefault(); // 阻止页面滚动
				title.setText('默写单词'); // 恢复标题
			}
		};
		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('keyup', handleKeyup);
		this.onClose = () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('keyup', handleKeyup);
			contentEl.empty();
		};
    }

    async pickNextCard(
        wordMeaningContainer: HTMLElement,
        inputContainer: HTMLElement,
        feedbackContainer: HTMLElement
    ) {
        const cards = Array.from(this.plugin.enabledCards.values());
        if (cards.length === 0) {
            feedbackContainer.setText('没有更多单词了！');
            return;
        }

        // 随机选择一个单词
        this.currentCard = cards[Math.floor(Math.random() * cards.length)];

        // 渲染单词的词义
        const file = this.plugin.app.vault.getFileByPath(this.currentCard.path);
        if (file instanceof TFile) {
            const content = await this.plugin.app.vault.read(file);
            const match = content.match(/##### 词义\n(?:- .*\n?)*/g);
			wordMeaningContainer.empty(); // 清空之前的内容
            if (match) {
				await MarkdownRenderer.render(
					this.app,
					match[0],
					wordMeaningContainer,
					file.path,
					this.plugin
				);
			} else {
                wordMeaningContainer.setText('未找到词义');
            }
        }

        // 清空输入容器并生成字母输入框
        inputContainer.empty();
        feedbackContainer.setText('');
        if (this.currentCard) {
            const word = this.currentCard.front;
            const inputFields: HTMLInputElement[] = [];

            // 为每个字母生成一个输入框
            for (let i = 0; i < word.length; i++) {
                const inputField = inputContainer.createEl('input', {
                    type: 'text',
                    cls: 'letter-input',
                });

                inputFields.push(inputField);

                // 自动跳转到下一个输入框
                inputField.addEventListener('input', () => {
                    if (inputField.value.length === 1 && i < word.length - 1) {
                        inputFields[i + 1].focus();
                    }
                    this.checkSpelling(inputFields, word, feedbackContainer, wordMeaningContainer, inputContainer);
                });

                // 支持使用退格键返回上一个输入框
                inputField.addEventListener('keydown', (event) => {
                    if (event.key === 'Backspace' && inputField.value === '' && i > 0) {
                        inputFields[i - 1].focus();
                    }
                });
            }

            // 聚焦第一个输入框
            inputFields[0].focus();
        }
    }

    checkSpelling(
        inputFields: HTMLInputElement[],
        word: string,
        feedbackContainer: HTMLElement,
        wordMeaningContainer: HTMLElement,
        inputContainer: HTMLElement
    ) {
        const userInput = inputFields.map((field) => field.value).join('');
        if (userInput.length === word.length) {
            if (userInput.toLowerCase() === word.toLowerCase()) {
                feedbackContainer.setText('正确！');
                setTimeout(async () => {
					await this.pickNextCard(wordMeaningContainer, inputContainer, feedbackContainer);
				}, 500);
            } else {
                feedbackContainer.setText('错误，请重试！');
                inputFields.forEach((field) => (field.value = '')); // 清空所有输入框
                inputFields[0].focus(); // 聚焦第一个输入框
            }
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
