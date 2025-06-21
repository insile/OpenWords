import { App, Modal, Notice, TFile, Setting, MarkdownRenderer, Component } from 'obsidian';
import { SuperMemoGrade } from 'supermemo';
import { CardInfo } from '../card';
import OpenWords from '../main';


// 背单词模态框
export class LearningModal extends Modal {
    plugin: OpenWords;
    component: Component;
    mode: 'new' | 'review';
    currentCard: CardInfo;
	isRating: boolean = false;
	currentRatingKey: string | null = null;

    constructor(app: App, plugin: OpenWords, mode: 'new' | 'review') {
        super(app);
        this.plugin = plugin;
        this.mode = mode;
        this.component = new Component();
    }

    onOpen() {
		// 加载组件并选卡
        this.component.load()
        this.pickNextCard();
		if (!this.currentCard) return;

		// 创建卡片容器和设置容器
		const { contentEl } = this;
        contentEl.empty();
        const cardContainer = contentEl.createDiv({ cls: 'openwords-card' });
        const settingsContainer = contentEl.createDiv({ cls: 'openwords-card-settings' });
        this.renderSettings(settingsContainer, cardContainer);
		this.renderCard(cardContainer);

		// 注册数字键和回车按键事件
        this.registerRatingKeyEvents(contentEl, cardContainer);
        this.registerRenderKeyEvents(cardContainer);
    }

    pickNextCard() {
        const now = window.moment(); // 获取当前时间
        let pool: CardInfo[];

        // 新词池是指所有新词, 旧词池是指所有已过期的旧词
        if (this.mode === 'new') {
            pool = Array.from(this.plugin.newCards.values()); // 将 Set 转换为数组
            if (pool.length === 0) {
                this.close();
                new Notice("已完成所有新词！");
                return;
            }
			// 新词排序：间隔降序，间隔相同则易记因子升序
			pool.sort((a, b) => {
				const intervalA = Number(a.interval);
				const intervalB = Number(b.interval);
				if (intervalA !== intervalB) return intervalB - intervalA; // 降序
				const efactorA = Number(a.efactor);
				const efactorB = Number(b.efactor);
				return efactorA - efactorB; // 升序
			});
        } else {
            pool = Array.from(this.plugin.dueCards.values())
                .filter(card => window.moment(card.dueDate).isBefore(now)) // 筛选已过期的单词
            if (pool.length === 0) {
                this.close();
                new Notice("没有需要复习的卡片！");
                return;
            }
			// 旧词排序：易记因子升序，易记因子相同则重复次数升序
			pool.sort((a, b) => {
				const efactorA = Number(a.efactor);
				const efactorB = Number(b.efactor);
				if (efactorA !== efactorB) return efactorA - efactorB; // 升序
				const repetitionA = Number(a.repetition);
				const repetitionB = Number(b.repetition);
				return repetitionA - repetitionB; // 升序
			});
        }

		// 单词调度 70% 纯随机, 30% 从排序后前 1% 中随机
		const randomMode = Math.random() < this.plugin.settings.randomRatio;
		if (randomMode) {
			this.currentCard = pool[Math.floor(Math.random() * pool.length)];
		} else {
			const topN = Math.max(1, Math.ceil(pool.length / 100));
			const topPool = pool.slice(0, topN);
			this.currentCard = topPool[Math.floor(Math.random() * topPool.length)];
		}
    }

    renderSettings(settingsContainer: HTMLElement, cardContainer: HTMLDivElement) {
        const grades: { grade: SuperMemoGrade, label: string }[] = [
            { grade: 0, label: '评分 0: 回答错误, 完全不会' },
            { grade: 1, label: '评分 1: 回答错误, 看到正确答案后感觉很熟悉' },
            { grade: 2, label: '评分 2: 回答错误, 看到正确答案后感觉很容易记住' },
            { grade: 3, label: '评分 3: 回答正确, 需要花费很大力气才能回忆起来' },
            { grade: 4, label: '评分 4: 回答正确, 需要经过一番犹豫才做出反应' },
            { grade: 5, label: '评分 5: 回答正确, 完美响应' },
        ];
        for (const { grade, label } of grades) {
            new Setting(settingsContainer)
                .setName(label)
                .addButton(btn => btn
                    .setButtonText(String(grade))
                    .onClick(() => this.rateCard(grade, cardContainer)));
        }
    }

	renderCard(cardContainer: HTMLDivElement) {
        cardContainer.empty();
        const wordContent = cardContainer.createDiv({ cls: 'openwords-card-content' });
        wordContent.textContent = this.currentCard.front;
        const file = this.plugin.app.vault.getFileByPath(this.currentCard.path);
        if (!file) {return;}
        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontMatter = fileCache?.frontmatter;
        if (!frontMatter) {return;}
        const tags: string[] = (frontMatter.tags || []).map((tag: string) => {
            const parts = tag.split('/');
            return parts.length > 1 ? parts[1] : tag;
        });
        const dueDate: string = frontMatter["到期日"]
        const interval: string = frontMatter["间隔"]
        const efactor: string = frontMatter["易记因子"]
        const repetition: string = frontMatter["重复次数"]

        const metaDiv = cardContainer.createDiv({ cls: 'openwords-card-meta' });

        // 第一行：标签
        const tagsDiv = metaDiv.createDiv({ cls: 'openwords-card-meta-tags' });
        tagsDiv.textContent = `标签: ${tags.join(', ')}`;

        // 第二行：其余元数据
        const infoDiv = metaDiv.createDiv({ cls: 'openwords-card-meta-info' });
        infoDiv.textContent = `易记因子: ${efactor} | 重复次数: ${repetition} | 到期日: ${dueDate} | 间隔: ${interval} `;
    }

    registerRatingKeyEvents(contentEl: HTMLElement, cardContainer: HTMLDivElement) {
        const handleKeydown = async (event: KeyboardEvent) => {
            if (event.key >= '0' && event.key <= '5') {
                if (this.isRating) return;
                this.isRating = true;
                this.currentRatingKey = event.key;
                const grade = parseInt(event.key) as SuperMemoGrade;
                await this.plugin.updateCard(this.currentCard, grade);
            }
        };
        const handleKeyup = async (event: KeyboardEvent) => {
            if (
                this.isRating &&
                this.currentRatingKey !== null &&
                event.key === this.currentRatingKey
            ) {
                this.isRating = false;
                this.currentRatingKey = null;
                this.pickNextCard();
                this.renderCard(cardContainer);
            }
        };
        this.plugin.registerDomEvent(contentEl, 'keydown', handleKeydown);
        this.plugin.registerDomEvent(contentEl, 'keyup', handleKeyup);
    }

    registerRenderKeyEvents(cardContainer: HTMLDivElement) {
        // 标记当前是否显示 Markdown 内容
        let isShowingMarkdown = false;

        const showMarkdown = async () => {
            if (isShowingMarkdown) return;
            const file = this.plugin.app.vault.getFileByPath(this.currentCard.path);
            if (file instanceof TFile) {
                const markdownContent = await this.plugin.app.vault.cachedRead(file);
                cardContainer.empty();
                const markdownRenderContainer = cardContainer.createDiv({ cls: 'openwords-card-markdown' });
                await MarkdownRenderer.render(
                    this.app,
                    markdownContent,
                    markdownRenderContainer,
                    file.path,
                    this.component
                );
                isShowingMarkdown = true;
            } else {
                new Notice('无法加载单词的 Markdown 文件！');
            }
        };

        const showWord = () => {
            if (!isShowingMarkdown) return;
            this.renderCard(cardContainer);
            isShowingMarkdown = false;
        };

        cardContainer.addEventListener('mouseenter', showMarkdown);
        cardContainer.addEventListener('mouseleave', showWord);

        // 按下回车显示内容，释放回车显示单词
        const handleKeyDown = async (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
				event.preventDefault();
                await showMarkdown();
            }
        };
        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
				event.preventDefault();
                showWord();
            }
        };
        this.plugin.registerDomEvent(cardContainer, 'keydown', handleKeyDown);
        this.plugin.registerDomEvent(cardContainer, 'keyup', handleKeyUp);

        // 让卡片容器可聚焦以接收键盘事件
        cardContainer.tabIndex = 0;
        cardContainer.focus();
    }

    async rateCard(grade: SuperMemoGrade, cardContainer: HTMLDivElement) {
		if (this.isRating) return;
		this.isRating = true;
        await this.plugin.updateCard(this.currentCard, grade);
        this.pickNextCard();
        this.renderCard(cardContainer);
		this.isRating = false;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.component.unload();
    }

}
