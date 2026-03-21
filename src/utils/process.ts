import { App, TFile } from "obsidian";
import { OpenWordsView } from "../views/main-view";


// 激活视图
export async function activateView(app: App, viewType: string) {
    const leaves = app.workspace.getLeavesOfType(viewType);

    if (leaves.length === 0) {
        await app.workspace.getLeaf(true).setViewState({
            type: viewType,
            active: true,
        });
    } else {
        const leaf = leaves[0];
        if (leaf) {
            await app.workspace.revealLeaf(leaf);
        }
    }
}

// 更新状态栏
export function updateStatusBar(app: App, viewType: string) {
    app.workspace.getLeavesOfType(viewType).forEach(leaf => {
        const view = leaf.view;
        if (view instanceof OpenWordsView) {
            view.updateStatusBar();
        }
    });
}

// 覆盖写入文件
export async function writeFile(app: App, filePath: string, content: string) {
    const existingFile = app.vault.getFileByPath(filePath);
    if (existingFile instanceof TFile) {
        await app.vault.modify(existingFile, content);
    } else {
        await app.vault.create(filePath, content);
    }
}

// 截断选中文本
export function truncateSelection(text: string, maxLength: number = 15) {
    if (text.length <= maxLength) return text;
    // 截断并添加省略号
    return text.substring(0, maxLength) + "...";
}
