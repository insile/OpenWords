import {SuperMemoItem} from 'supermemo';


// 单词卡片信息
export interface CardInfo extends SuperMemoItem {
    front: string;
    dueDate: string;
    path: string;
    isMastered: boolean;
}
