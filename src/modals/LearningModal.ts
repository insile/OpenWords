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
        this.component.load()
        this.pickNextCard();
		const { contentEl } = this;
        contentEl.empty();

        if (!this.currentCard) return;

        // 创建卡片容器并固定样式
        const cardContainer = contentEl.createDiv({ cls: 'openwords-card' });
        const settingsContainer = contentEl.createDiv({ cls: 'openwords-card-settings' });

        new Setting(settingsContainer)
            .setName(`评分 0: 回答错误, 完全不会`)
            .addButton(btn => btn
                .setButtonText('0')
                .onClick(() => this.rateCard(0 as SuperMemoGrade, cardContainer)))
        new Setting(settingsContainer)
            .setName(`评分 1: 回答错误, 看到正确答案后感觉很熟悉`)
            .addButton(btn => btn
                .setButtonText('1')
                .onClick(() => this.rateCard(1 as SuperMemoGrade, cardContainer)))
        new Setting(settingsContainer)
            .setName(`评分 2: 回答错误, 看到正确答案后感觉很容易记住`)
            .addButton(btn => btn
                .setButtonText('2')
                .onClick(() => this.rateCard(2 as SuperMemoGrade, cardContainer)))
        new Setting(settingsContainer)
            .setName(`评分 3: 回答正确, 需要花费很大力气才能回忆起来`)
            .addButton(btn => btn
                .setButtonText('3')
                .onClick(() => this.rateCard(3 as SuperMemoGrade, cardContainer)))
        new Setting(settingsContainer)
            .setName(`评分 4: 回答正确, 需要经过一番犹豫才做出反应`)
            .addButton(btn => btn
                .setButtonText('4')
                .onClick(() => this.rateCard(4 as SuperMemoGrade, cardContainer)))
        new Setting(settingsContainer)
            .setName(`评分 5: 回答正确, 完美响应`)
            .addButton(btn => btn
                .setButtonText('5')
                .onClick(() => this.rateCard(5 as SuperMemoGrade, cardContainer)))
        this.render(cardContainer);

        // 监听数字键 0-5 的按键事件
        const handleKeydown = async (event: KeyboardEvent) => {
            if (event.key >= '0' && event.key <= '5') {
				if (this.isRating) return;
				this.isRating = true;
				this.currentRatingKey = event.key
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
				this.isRating=false
				this.currentRatingKey = null
				this.pickNextCard()
				this.render(cardContainer)
            }
        };

        this.plugin.registerDomEvent(contentEl, 'keydown', handleKeydown);
        this.plugin.registerDomEvent(contentEl, 'keyup', handleKeyup);

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
        } else {
            pool = Array.from(this.plugin.dueCards.values())
                .filter(card => window.moment(card.dueDate).isBefore(now)) // 筛选已过期的单词
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

    render(cardContainer: HTMLDivElement) {
		cardContainer.empty()

        // 标记当前是否显示 Markdown 内容
        let isShowingMarkdown = false;
        // 初始显示单词
        const wordContent = cardContainer.createDiv({ cls: 'openwords-card-content' });
        wordContent.textContent = this.currentCard.front;

        // 添加鼠标悬浮事件切换内容
        cardContainer.addEventListener('mouseenter', async () => {
            if (isShowingMarkdown) return; // 如果已经显示 Markdown 内容，则不重复加载

            const file = this.plugin.app.vault.getFileByPath(this.currentCard.path);
            if (file instanceof TFile) {
                const markdownContent = await this.plugin.app.vault.cachedRead(file);

                // 清空卡片内容并渲染 Markdown 内容
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
        });

        cardContainer.addEventListener('mouseleave', () => {
            if (!isShowingMarkdown) return; // 如果已经显示单词内容，则不重复加载

            // 切换回显示单词
            cardContainer.empty();
            const wordContent = cardContainer.createDiv({ cls: 'openwords-card-content' });
            wordContent.textContent = this.currentCard.front;
            isShowingMarkdown = false;
        });


    }

    async rateCard(grade: SuperMemoGrade, cardContainer: HTMLDivElement) {
		if (this.isRating) return;
		this.isRating = true;
        await this.plugin.updateCard(this.currentCard, grade);
        this.pickNextCard();
        this.render(cardContainer);
		this.isRating = false;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.component.unload();
    }

}
