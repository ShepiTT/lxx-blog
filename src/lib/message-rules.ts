// 留言板的限制，服务端校验和留言页的输入框共用。
export const MESSAGE_LIMITS = {
  name: 12, // 昵称字数
  text: 50, // 留言字数
  gapSeconds: 60, // 同一个人两条留言至少间隔
  perDay: 5, // 同一个人 24 小时内最多
  sitePerHour: 60, // 整个留言板每小时最多，防止被刷
  keep: 500, // 只保留最新的这么多条
};
