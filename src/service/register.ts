import OpenWords from "main";
import { activateView, updateStatusBar } from "utils/process";
import { OPENWORDS_VIEW } from "../views/main-view";
import { addDoubleBrackets, autoDoubleLinkWord } from "./words-link";
import { Notice, TFile } from "obsidian";
import { loadWordMetadata } from "./words-manager";


// 注册命令
export function registerCommands(plugin: OpenWords) {
    // 激活视图命令
    plugin.addCommand({
        id: 'LearningTypeModal',
        name: '学习视图',
        callback: async () => {
            await activateView(plugin.app, OPENWORDS_VIEW);
        }
    });
    // 添加双链命令
    plugin.addCommand({
        id: 'addDoubleBrackets',
        name: '文档双链',
        editorCallback: async () => {
            await addDoubleBrackets(plugin);
        }
    });
    // 添加单词双链命令
    plugin.addCommand({
        id: 'addDoubleBracketsWord',
        name: '单词双链',
        editorCallback: async () => {
            await autoDoubleLinkWord(plugin);
        }
    });
}

// 注册文件监听器
export function registerFileWatchers(plugin: OpenWords) {
    // 先清理旧的监听器
    unregisterFileWatchers(plugin);

    // 更新当前监听的文件夹路径
    plugin.currentFolderPath = plugin.settings.folderPath.endsWith("/")
        ? plugin.settings.folderPath
        : plugin.settings.folderPath + "/";

    // 监听单词文件创建事件
    const createRef = plugin.app.vault.on("create", async (file: TFile) => {
        if (file.path.endsWith(".md") && file.path.startsWith(plugin.currentFolderPath)) {
            await loadWordMetadata(plugin, file);
        }
    });
    plugin.fileWatcherRefs.push(createRef);

    // 监听单词文件删除事件
    const deleteRef = plugin.app.vault.on("delete", (file: TFile) => {
        if (file.path.endsWith(".md") && file.path.startsWith(plugin.currentFolderPath)) {
            plugin.allCards.delete(file.basename);
            plugin.masterCards.delete(file.basename);
            plugin.enabledCards.delete(file.basename);
            plugin.newCards.delete(file.basename);
            plugin.dueCards.delete(file.basename);
            updateStatusBar(plugin.app, OPENWORDS_VIEW);
        }
    });
    plugin.fileWatcherRefs.push(deleteRef);

    // 监听单词文件缓存修改事件
    const changedRef = plugin.app.metadataCache.on("changed", async (file) => {
        if (file.path.endsWith(".md") && file.path.startsWith(plugin.currentFolderPath)) {
            await loadWordMetadata(plugin, file);
        }
    });
    plugin.fileWatcherRefs.push(changedRef);
}

// 注销文件监听器
export function unregisterFileWatchers(plugin: OpenWords) {
    plugin.fileWatcherRefs.forEach(ref => {
        plugin.app.vault.offref(ref);
        plugin.app.metadataCache.offref(ref);
    });
    plugin.fileWatcherRefs = [];
}

// 注册编辑器菜单
export function registerEditorMenu(plugin: OpenWords) {
    plugin.registerEvent(
        plugin.app.workspace.on("editor-menu", (menu, editor, view) => {
            const truncateSelection = (text: string, maxLength: number = 15): string => {
                if (text.length <= maxLength) return text;
                // 截断并添加省略号
                return text.substring(0, maxLength) + "...";
            };
            const selection = editor.getSelection().trim();

            const hasAnyLink = /\[\[.*?\]\]/.test(selection);
            if (hasAnyLink) {
                menu.addItem((item) => {
                    item
                        .setTitle("清除选中区域的所有双链")
                        .setIcon("link-off")
                        .onClick(() => {
                            // 将所有 [[A|B]] 替换为 B，将 [[A]] 替换为 A
                            const cleanedText = selection.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
                            editor.replaceSelection(cleanedText);
                            new Notice("已清除选中区域的所有双链");
                        });
                });
            }

            if (!selection || selection.length > 50) return;
            menu.addItem((item) => {
                item
                    .setTitle(`链接 "${truncateSelection(selection)}" 到单词库`)
                    .setIcon("link")
                    .onClick(async () => {
                        // 执行上面提到的搜索和替换逻辑
                        await autoDoubleLinkWord(plugin);
                    });
            });
        })
    );
}