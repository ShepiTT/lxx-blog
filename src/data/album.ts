// 相册：照片放进 public/album/，在这里登记。目前都是占位图，换成你自己的照片即可。
// 每张照片可以写一句说明（caption），点开大图时会显示。

export interface Photo {
  src: string;
  caption?: string;
}

export interface Album {
  name: string;
  description: string;
  photos: Photo[];
}

export const ALBUMS: Album[] = [
  {
    name: '海边',
    description: '风、海浪，还有远处的灯塔。',
    photos: [
      { src: '/album/seaside-1.jpg', caption: '午后的灯塔' },
      { src: '/album/sunset-2.jpg', caption: '日落时分' },
      { src: '/album/night-1.jpg', caption: '夜里的灯塔还亮着' },
      { src: '/album/seaside-2.jpg', caption: '海边的小坡' },
      { src: '/album/sunset-1.jpg', caption: '晚霞' },
    ],
  },
  {
    name: '日常',
    description: '写代码之外，随手拍下的片刻。',
    photos: [
      { src: '/album/spring-1.jpg', caption: '春天来了' },
      { src: '/album/dawn-1.jpg', caption: '清晨' },
      { src: '/album/noon-1.jpg', caption: '晴天' },
      { src: '/album/spring-2.jpg', caption: '粉色的天空' },
    ],
  },
];
