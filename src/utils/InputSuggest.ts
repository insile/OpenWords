import { App, TAbstractFile, TFolder, AbstractInputSuggest } from 'obsidian';


// 输入建议类, 用于文件夹路径的自动补全
export class FolderSuggest extends AbstractInputSuggest<string> {
    inputEl: HTMLInputElement;
    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(query: string): string[] {
        const filesAndFolders: TAbstractFile[] = this.app.vault.getAllLoadedFiles();
        const folderSuggestions: string[] = [];

        filesAndFolders.forEach(file => {
            if (file instanceof TFolder && file.path.toLowerCase().includes(query.toLowerCase())) {
                folderSuggestions.push(file.path);
            }
        });

        return folderSuggestions.sort();
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.createDiv({ text: value });
    }

    selectSuggestion(value: string): void {
        this.inputEl.value = value;
        this.inputEl.trigger('input');
        this.close();
    }
}


// 标签历史建议类，用于显示标签输入历史
export class TagHistorySuggest extends AbstractInputSuggest<string> {
    inputEl: HTMLInputElement;
    tagHistory: string[];
    onSelectCallback: (value: string) => void;
    onDeleteCallback: (value: string) => Promise<void>;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        tagHistory: string[],
        onSelectCallback: (value: string) => void,
        onDeleteCallback: (value: string) => Promise<void>
    ) {
        super(app, inputEl);
        this.inputEl = inputEl;
        this.tagHistory = tagHistory;
        this.onSelectCallback = onSelectCallback;
        this.onDeleteCallback = onDeleteCallback;
    }

    getSuggestions(query: string): string[] {
        if (!query.trim()) {
            // 如果查询为空，返回所有历史记录（反向排序，最新的在前）
            return [...this.tagHistory].reverse();
        }
        // 否则按查询过滤，然后反向排序
        return this.tagHistory.filter(tag =>
            tag.toLowerCase().includes(query.toLowerCase())
        ).reverse();
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        const container = el.createDiv({ cls: 'openwords-tag-history-item' });

        container.createDiv({ text: value, cls: 'openwords-tag-history-text' });

        const deleteBtn = container.createEl('button', {
            cls: 'openwords-tag-history-delete',
            text: '删除',
        });

        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            await this.onDeleteCallback(value);
            // 删除该条历史记录的 DOM 元素，保持提示框打开
            el.remove();
        };
    }

    selectSuggestion(value: string): void {
        this.inputEl.value = value;
        this.inputEl.trigger('input');
        this.close();
        this.onSelectCallback(value);
    }
}
