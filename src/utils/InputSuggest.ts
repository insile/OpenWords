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
