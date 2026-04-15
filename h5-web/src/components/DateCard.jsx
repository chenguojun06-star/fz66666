import { useState, useEffect, useRef } from 'react';

const FLOWERS = [
  '薰衣草：等待爱情', '向日葵：沉默的爱', '玫瑰：热情', '百合：纯洁',
  '康乃馨：感恩', '郁金香：爱的表白', '雏菊：深藏心底的爱', '紫罗兰：永恒的美',
  '水仙：自爱', '樱花：生命之美', '风信子：重生的爱', '铃兰：幸福归来',
  '牡丹：富贵吉祥', '荷花：清白坚贞', '梅花：坚强不屈', '菊花：高洁隐逸',
  '桃花：爱情俘虏', '杏花：娇羞可爱', '梨花：纯情纯爱', '兰花：高洁典雅',
  '桂花：收获与荣誉', '茉莉：忠贞尊敬', '海棠：温和美丽', '芍药：情有独钟',
  '杜鹃：节制欲望', '山茶：理想之爱', '丁香：谦逊光辉', '合欢：言归于好',
  '木棉：珍惜幸福', '含羞草：知廉耻', '满天星：真心喜欢', '勿忘我：永恒记忆',
];

export default function DateCard() {
  const [dateInfo, setDateInfo] = useState(null);

  useEffect(() => {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = weekDays[now.getDay()];
    const seasons = ['❄️', '🌸', '☀️', '🍂'];
    const seasonIdx = month <= 2 ? 0 : month <= 5 ? 1 : month <= 8 ? 2 : 3;
    const seasonNames = ['冬', '春', '夏', '秋'];
    const flower = FLOWERS[(day - 1) % FLOWERS.length];
    setDateInfo({ year, month, day, weekDay, seasonIcon: seasons[seasonIdx], seasonName: seasonNames[seasonIdx], flower });
  }, []);

  if (!dateInfo) return null;

  return (
    <div className="weather-card">
      <div className="weather-top">
        <div className="weather-left">
          <span className="weather-emoji">{dateInfo.seasonIcon}</span>
          <div className="weather-temp-wrap">
            <span className="weather-temp">{dateInfo.month}月{dateInfo.day}日</span>
            <span className="weather-desc">周{dateInfo.weekDay}</span>
          </div>
        </div>
        <span className="weather-season">{dateInfo.seasonName}季</span>
      </div>
      <div className="weather-tip">{dateInfo.flower}</div>
    </div>
  );
}
