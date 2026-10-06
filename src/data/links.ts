// 友链：交换友链后，把对方的信息加到 FRIEND_LINKS 里。
// avatar 可以是对方头像的完整网址，也可以把图片放进 public/ 后写相对路径。

export interface FriendLink {
  name: string;
  url: string;
  avatar: string;
  description: string;
}

export const FRIEND_LINKS: FriendLink[] = [
  // { name: '某某的博客', url: 'https://example.com', avatar: 'https://example.com/avatar.png', description: '一句话介绍' },
];
