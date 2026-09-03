/* ============================================================
   小派与小远的家 · 消消乐引擎原型
   - 79 关由公式参数化生成(棋盘大小/步数/目标分数/障碍密度)
   - 虚拟时间:每破 6 关,小远回家一次(收明信片/礼物)
   - 每 10 关解锁恋爱日记一篇,第 79 关 = 结婚篇
   本档案所有数值(难度公式/文案)都是原型占位,方便之后微调。
   ============================================================ */

const TOTAL_LEVELS = 79;
const HOME_CYCLE = 6;                       // 小远每隔几关回家一次(6关 x 13张明信片,79关内剛好收全)
const MILESTONES = [9,19,29,39,49,59,69,79]; // 日记解锁关卡

// 无尽挑战关的月兔排行榜后端(Cloudflare Worker),部署好之后把网址换成实际的
const LEADERBOARD_API = 'https://llxxl-leaderboard.yingbangbang2026.workers.dev';

const SAVE_KEY = 'llxxl_save_v1';

/* ---------------- 体力(爱心)系统:失败会扣 1 颗,等时间回血 ---------------- */
const MAX_LIVES = 5;
const REGEN_MS = 15*60*1000; // 每 15 分钟回 1 颗,数值可调

/* ---------------- 首页分层美术的画布座标(来自原始设计稿 2048x3200) ---------------- */
const CANVAS_W = 2048, CANVAS_H = 3200;
// 房间本体(非透明范围)的边界,拿来当「满版」裁切基准,而不是整张含大量透明边界的画布
const ROOM_BBOX = {x1:435, y1:547, x2:1621, y2:2723};
const HOTSPOTS = {
  diary:    {x1:451,  y1:2453, x2:705,  y2:2703},
  gift:     {x1:1417, y1:2322, x2:1593, y2:2496},
  postcard: {x1:1417, y1:2528, x2:1593, y2:2702},
  avatar:   {x1:474,  y1:547,  x2:856,  y2:853},
  endless:  {x1:1200, y1:547,  x2:1582, y2:853, labelPos:'below'}, // 房间右上墙面,顶边跟头像(avatar)切齐,大小也跟头像一样
  piggy:    {x1:932, y1:1540, x2:1043, y2:1641}, // 存钱筒图案(icon_piggy.png)实际画的位置,含一点点击边距
};
// 进度牌:横向贴在头像按键正下方置中(牌子压到的地方刚好是头像图案的留白,视觉上不会挡到东西),纵向对齐「月兔大挑战」白字下缘;爱心牌:放在恋爱日记图示右边,垂直置中对齐
const PROGRESS_PILL_ANCHOR = {x:(474+856)/2, y:853+40};
const LIVES_PILL_ANCHOR = {x:705+50, y:(2453+2703)/2};
const COIN_PILL_ANCHOR = {x:(932+1043)/2, y:1641+24}; // 贴在存钱筒图示正下方,水平置中
// 恋爱日记卡片背景图同样是「整张画布 2048x3200 + 透明背景」,实际图案只占中间一小块
const DIARY_BG_BBOX = {x1:616, y1:1001, x2:1431, y2:2199};

/* ---------------- 消除图案(六种,配色取自房间美术的粉/杏/紫/绿/卡其/蓝) ---------------- */
const TILE_TYPES = [
  { name:'butterfly', bg:'#e3f2fb', img:'assets/tiles/butterfly.png' },
  { name:'star',      bg:'#fde9c8', img:'assets/tiles/star.png' },
  { name:'bunny',     bg:'#fbe3ef', img:'assets/tiles/bunny.png' },
  { name:'dogface',   bg:'#eef2e0', img:'assets/tiles/dogface.png' },
  { name:'moonface',  bg:'#ece6f7', img:'assets/tiles/moonface.png' },
  { name:'movie',     bg:'#f5f0e6', img:'assets/tiles/movie.png' },
  { name:'mic',       bg:'#dfe9ee', img:'assets/tiles/mic.png' },
  { name:'rose',      bg:'#fbe0e6', img:'assets/tiles/rose.png' },
  { name:'dog',       bg:'#fbe9dd', img:'assets/tiles/dog.png' },
  { name:'sun',       bg:'#fff3c4', img:'assets/tiles/sun.png' },
  { name:'heart',     bg:'#f6d4c9', img:'assets/tiles/heart.png' },
  { name:'xiaopai',   bg:'#fadce6', img:'assets/tiles/xiaopai.png' },
  { name:'xiaoyuan',  bg:'#dff0df', img:'assets/tiles/xiaoyuan.png' },
];
// 小派/小远两张角色图不算常设图案,只在剧情日记关卡(MILESTONES)跟纪念品触发关卡(MEMENTO_LEVELS)出现,
// 直接顶替掉当关的兔兔(bunny)/狗狗(dogface),图案总数不变,难度不会因此变高
const BUNNY_IDX = TILE_TYPES.findIndex(t=>t.name==='bunny');
const DOGFACE_IDX = TILE_TYPES.findIndex(t=>t.name==='dogface');
const XIAOPAI_IDX = TILE_TYPES.findIndex(t=>t.name==='xiaopai');
const XIAOYUAN_IDX = TILE_TYPES.findIndex(t=>t.name==='xiaoyuan');
const MOONFACE_IDX = TILE_TYPES.findIndex(t=>t.name==='moonface'); // 月亮:配对时炸开周遭 3x3
const BUTTERFLY_IDX = TILE_TYPES.findIndex(t=>t.name==='butterfly'); // 40关后:4连以上清空整排/整列
const STAR_IDX = TILE_TYPES.findIndex(t=>t.name==='star');
const HEART_IDX = TILE_TYPES.findIndex(t=>t.name==='heart');
const SUN_IDX = TILE_TYPES.findIndex(t=>t.name==='sun'); // 60关后:配对成功清空十字型两排

/* ---------------- 收藏册占位内容 ---------------- */
const POSTCARD_ITEMS = [
  '🏙️ 天津出差','🍺 青岛出差','🌆 广州出差','🌶️ 重庆出差','🎡 长沙出差',
  '🏝️ 厦门出差','🌃 深圳出差','🎆 上海出差','🍁 南京出差','🐼 成都出差',
  '🌸 杭州出差','⛰️ 贵州出差','🌴 海南出差'
];

// 两人出游的合照:跟上面的出差明信片一起收在「明信片册」里,但触发关卡固定、有照片+故事,格式跟纪念品卡片相同
const COUPLE_PHOTO_LEVELS = [12, 23, 41, 57, 71];
const COUPLE_PHOTO_ITEMS = {
  12:{name:`男团毕业抓拍照片`, img:`assets/gifts/12.jpg`, story:`最后的告别舞台，小远忍不住在台上哭了。小派一直以为，如果分别来临时第一个会哭的肯定是情绪明显的自己，没想到却是他心目中最坚强的远哥。`},
  23:{name:`男团访谈截图照片`, img:`assets/gifts/23.jpg`, story:`偷偷摸摸地谈恋爱，小远虽然因为男团道德很小心，但有时仍会情不自禁地做出亲密动作。不像小派身为团内最小的外国籍成员，怎么撒娇都没有人奇怪。而那几次稀少的情不自禁，总是让小派甜蜜许久。
这次访谈是挑战互相对视看谁先笑，结果小远笑出来同时忍不住摸了摸小派的鼻头，一扫而过的碰触像春风轻捎过心尖，笑容映在小派的眼眸闪闪发亮。`},
  41:{name:`环球影城合照`, img:`assets/gifts/41.jpg`, story:`小派盯着天气预报找到了一个凉快的晴天,预订了两张环球影城门票,又网购了两套巫师袍。
小派当然是不管前方如何都应勇向前的格兰芬多,小远则是明知可能无果却依旧奋不顾身的赫奇帕奇!
小远口嫌体正直,穿上衣服拿起魔法棒玩的不亦乐乎,一会帕绰糯一会啃大瓜,小派拿着胶卷相机给两人拍了好多照,到了最标致的地球前,小派请求旁边的一位姐姐帮忙,给二人拍了张合照。
近点,再近点,姐姐指挥到。
两人的脚尖靠拢,再靠拢,最终在快门按下的瞬间,小派揽住了小远的肩膀。
不愧是英勇的格兰芬多,但下一秒,拿剑的勇士便涨红了脸,因为那位带着黄色围巾的巫师悄悄垫脚,在他耳边低声道:"我以为刚刚我们应该接吻的。"

近些,再靠近些。勇敢的求爱者会遇到一双结结实实捧住他炽热心脏的手。`},
  57:{name:`泰国行合照`, img:`assets/gifts/57.jpg`, story:`那是小远第二次跟小派去泰国见家长,还记得第一次见到玫瑰女士,玫瑰女士直接推开小派拥抱小远,两个人是不用明说也能让家人感知到爱的亲密关系。
浪漫少女小派不知道从哪里知道了在摩天轮最高点接吻就能永远在一起的都市传说,拉着小远再访了他们男团解散前去过的摩天轮。`},
  71:{name:`Pocky对小派的意义`, img:`assets/gifts/71.gif`, story:`小派本来没那么爱吃Pocky，他平均爱着所有甜点零食。但因为有一次小远要帮他戒甜食，在他想用到一半的时候，突然凑了过来，咬走了一半的Pocky。
如此近距离地看着小远的美丽脸庞，呼吸吐息都显得暧昧起来——小远的厚唇湿润着，带着水蜜桃唇膏的甜香，轻咬着那一半巧克力。小远的睫毛不密但微翘着仿若幼鸟的初羽，轻柔而诱人。小派最终怎么吃掉那包Pocky，他已经不记得了，只记得自己如雷般的心跳声还有那抹唇色。`},
};
// 跟恋爱日记撞关的几个(原本 10/20/30/40/50/60/70)刻意往前错开几关,
// 避免「获得纪念品」跟「戀愛日記」两个弹窗同一整数关卡一次全部跳出来。
const MEMENTO_LEVELS = [0, 5, 7, 15, 17, 21, 25, 27, 31, 35, 37, 45, 47, 55, 65, 67, 75];

const MEMENTO_ITEMS = {
  0:{name:`家的钥匙`, location:``, img:`assets/gifts/0.png`, story:`「希望哥哥有空可以来找我玩!」
全团11个人,小派新房子的钥匙只送给了小远。没收到钥匙的其他人起哄着,小派笑弯了眼,小远红着脸抿嘴收下了。`},
  5:{name:`故宫小香囊`, location:`书包上的`, img:`assets/gifts/5.png`, story:`小派上学时,同学会问书包上的香囊是去那里买的,小派总是笑着说是哥哥送的。
这是他们第一次一起去故宫玩,一起站在中轴线,一起共享整个世界的纪念。`},
  7:{name:`蝴蝶结卫衣`, location:`床上的`, img:`assets/gifts/7.png`, story:`这是件特别有纪念意义的衣服。正常来说小远的衣服不喜欢被乱弄,在小派的不屈不挠及小远的放任下,小派在彩排时在卫衣的领口处绑了一个非常适合小远的蝴蝶结,甚至在活动结束后也不允许小远拆掉。
某次小远走得急,把衣服落家里了。小派想小远时会穿着对镜自拍,用涂鸦笔在图片上大大圈出蝴蝶结并附以对自己创作的八百字赞美小作文打包发给小远。`},
  15:{name:`宜家粉绿色情侣对杯`, location:`厨房台面的`, img:`assets/gifts/15.png`, story:`厨房的杯架放着两只粉色、绿色马克杯。粉色马克杯,是为了特别的人准备的,而另一只「最好看的绿色马克杯」通常都在小派手上或书桌上,装着好喝的咖啡。`},
  17:{name:`绿色围巾`, location:`立式衣架上的`, img:`assets/gifts/17.jpg`, story:`派派暗搓搓晒着爱意,本来说最爱黑白色性冷淡风的他不知道从何时开始喜欢了绿色,甚至变成他口中「最伟大的颜色」。`},
  21:{name:`远的麦克风`, location:``, img:`assets/gifts/21.png`, story:``},
  25:{name:`狗狗玩偶`, location:`床头的`, img:`assets/gifts/25.png`, story:`一大早小派按下最后一个闹钟,锤打了床头玩偶七下。`},
  27:{name:`玻璃罩蝴蝶`, location:`客厅书柜上的`, img:`assets/gifts/27.png`, story:`一个周末,派预定了一家手工店,出门做手工,历经九九八十一难,终于做出【玻璃罩蝴蝶】,骄傲拍图并连发18条朋友圈。粉丝问他为什么喜欢蝴蝶,他说:"我喜欢🦋的原因,就是蝴蝶很自由……我觉得它非常的浪漫🌹"
但其实是因为小远的明星符号就是蓝色蝴蝶,可惜不能说。`},
  31:{name:`星星抱枕`, location:``, img:`assets/gifts/31.png`, story:``},
  35:{name:`锁头项链、钥匙项链`, location:`情侣配饰`, img:`assets/gifts/35.png`, story:`自从异地恋生活,小派每次看到小远跟新人的合照都会小小的醋涨了一下。小远知道后,给两人买了情侣配饰【锁、钥匙】,即使小远认识很多新人,那把锁也只有小派可以开。`},
  37:{name:`黑框眼镜`, location:`客厅桌上的两副`, img:`assets/gifts/37.png`, story:`小远有高度近视,但是不爱带框架眼镜,他总感觉他戴上眼镜看起来很呆,但隐形又很伤眼,有时休息不好连轴转,一戴上隐形头就晕得不得了。
"在家里可以不用戴眼镜",小派帮他滴完眼药水说,"框架压鼻梁,隐形伤眼睛,你把你自己全部交给我就好。"
于是小远被小派牵着洗漱吃饭上厕所,两个人靠在沙发上天南海北的聊,聊着聊着小远依偎着身边的温暖缓缓睡去。等他醒来,睡眼朦胧看见小派在他面前笑,不由自主伸手去勾眼镜,被小派一下子按住。
"干嘛?"小远不满意地嘟囔,只模糊看到小派的脸慢慢凑近。
"你别凑这么近,我看不清…"说着小远便要推开小派,没料到被人反手捉住压在沙发上,含着雾气的话喷得睫毛重重下垂,随着湿漉漉的吻压下来——
"你不用看清我,我们接吻吧。"`},
  45:{name:`辣子鸡`, location:`餐桌上的（只有小远小派一起在厨房的画面才出现）`, img:`assets/gifts/45.png`, story:`晚上放学回到家,小远竟然在家,两个人亲密了一番后小派就被远叫去写作业了。小派吭哧吭哧写完作业,发现远做了小派最爱吃的辣子鸡。
男团刚成立的时候,小派刚从泰国来到中国,对中国料理说不上多热爱,直到小远深夜做了【辣子鸡】给他吃,从此这就是他最爱的料理了。他永远都会记得那个夜晚,整个团小远只叫他一个人来吃,他第一次感受到小远的温柔与关爱,他是他最特别的小孩。`},
  47:{name:`便条纸`, location:`冰箱上的`, img:`assets/gifts/47.jpg`, story:`「派,
我给你放了你爱吃的菜,记得吃。
你下次想吃什么再跟我说。」
小远来北京工作总是来去匆匆,但不管再忙都会给派派煮些拿手菜放在冰箱。派派只要看到冰箱贴就知道又有好吃的。`},
  55:{name:`垂耳兔粉绿帽`, location:``, img:`assets/gifts/55.jpg`, story:`这个帽子是小远个人巡演的服装,每当他想到小派无法参加自己的演出就感到难受,但只要他还是偶像歌手,他们就不能公开。
因为这样,小远喜欢在演出里加入一些只有两个人才看得懂的符号,就像这顶垂耳兔粉绿帽——小派的应援色跟动物塑就是粉色的兔子。`},
  65:{name:`小王子氛围灯`, location:`二楼窗台矮柜上的`, img:`assets/gifts/65.png`, story:`小派跟小远说过小王子的故事,小王子为了守着他的玫瑰,回到了小小的星球上。
「当你拥有属于你的那一朵玫瑰时,这世界上万千玫瑰对你都不重要了。」
看到这个礼物,小派气消了大半,他知道即使相隔两地,他们永远属于彼此。`},
  67:{name:`专辑《闪闪》`, location:`客厅桌上的`, img:`assets/gifts/67.jpg`, story:`因为小远在歌手的路上越走越远,小派除了演员外对于音乐制作也有天赋,俩人在音乐上有了更多合作。派派写曲子、英文歌词,小远再帮小派填成中文、帮录和声。
渐渐地,在两人的歌曲里,常可以看到一个制作人署名 HY,这是两个人的暗号——HHYY,花好月圆似当年。`},
  75:{name:`相框及干燥花手链`, location:`一楼窗前矮柜上的邀请函、电影票相框跟干燥花`, story:`派派来中国的第一部电影上映,首映礼小派也给小远寄了邀请函,可小远不巧正好有音综节目的录制,实在去不了,小派心里不高兴表面却也强撑着。
等路演结束了,小派回到出租屋发现小远悄悄回家给了他一个惊喜,俩人装备齐全遮的严严实实的去看了电影。
门口遇到卖花的阿婆,小派偷偷摸摸给小远买了束花,阿婆问他是不是送给女朋友,小派笑着摇摇头说,是送给我哥的,我生命里很重要的人。
阿婆似懂非懂地点头,又送了他两个栀子花手链,阿婆说:今生戴花来世漂亮,你这辈子这么漂亮,下辈子一定也要漂漂亮亮的活。小派高兴地点头,拿去给小远戴上,手环清香,萦绕在两人手腕间,花瓣若有似无的相互碰撞,手心热乎乎湿润润的。好紧张,哪怕牵手无数次,再牵手也还是像刚恋爱般紧张。`},
};

/* ---------------- 恋爱日记占位文案 ---------------- */
const DIARY_TEXT = {
  0:{title:`恋爱日记 · 楔子`, text:`小派和小远在男团内偷偷摸摸地谈了恋爱,两年后男团解散直播的互送礼物环节,小派送给了小远一把[钥匙]。
「希望哥哥有空可以来找我玩!」
全团11个人,小派新房子的钥匙只送给了小远。没收到钥匙的其他人起哄着,小派笑弯了眼,小远红着脸抿嘴收下了。

男团解散后,小派成了大学生,吭哧吭哧地搬进了自己租的房,有厨房有大电视还有一张加大双人床!
小派想跟小远永远在一起,但解散后就不能像在团里一样每天黏在一起。
「如果远哥来的时候能睡在一起就好了……」不知想到了什么,小派抱着菜狗抱枕傻笑起来。`},
  9:{title:`恋爱日记 · 第一篇`, text:`小远是歌手,常在各地飞来飞去开演唱会,不能常来找他。虽然房子布置得很舒服,但小派总觉得还是空空的。

或许空空的不是房间,是少了一个人。

趁某次小远来找他,他们一起去逛街。小派往购物车里噼里啪啦扔了一堆东西,收银姐姐结账时笑:"你们这么喜欢绿色啊?"
小派小鸡啄米似的点头道,"是啊是啊,命定之色。"
"小派把袋子撑着。"小远嘟着嘴,"又买这么多绿色,马上家里都成绿化带了。"
小派有些不好意思,埋头苦装购物袋,突然发现一抹粉色,眼疾手快抢在小远之前捞出来,像战利品一样举过头顶,"远哥!这是什么!"
小远头也不抬,不吭声地提起一个袋子就走。小派赶紧将剩下的东西装好紧跟上去,"哥是什么时候和我买的同款杯子,还拿的粉色!派派的颜色!"
"顺手就拿了。"小远面不改色。
"我知道。"小派笑得狡黠。
"知道还问。"
小派高深莫测地摇头,"我知道的不是这个。"
回停车场的路上小派像小蝴蝶一样绕着他哥飘来飘去,小远虽不说话,耳尖却也悄悄红了一片。他怎么会不知道呢,情侣杯、情侣饰品,这些在团里不能展现的爱意,变成如今相隔千里的两人之间缠绕的线。红线缠结、丝丝缕缕。从两头,连到家。`},
  19:{title:`恋爱日记 · 第二篇`, text:`小派读书很用功,考上电影学院后不多时日便接到了电影的重要男配。煲电话粥的时间小远也会陪他一起对词,但更多时候只是开着扩音各自忙着自己的工作。
对他们来说,仅仅是听着电话那端的呼吸,也能感到幸福和安心。

辛苦拍戏的两个月里,小远去探班,给一整个剧组买了奶茶,希望他们可以多多照顾小派。杀青当天,小远又特别来片场接他回家,到家后一入眼便是一大桌饭菜,当晚就给小派吃得肚皮圆溜溜躺在沙发上消食。

两个人都在为了同一个梦想各自努力着。在外面小远是明星、歌手,小派是大学生、演员,但在家里,他们只是彼此爱的那个人。`},
  29:{title:`恋爱日记 · 第三篇`, text:`小派最近有点不高兴,因为小远的工作有点太忙了,而且小远在工作中好像遇见了…嗯…很多新的人。
异地恋,小派吃醋,小派心慌。
小远已经忙到没有精力和他解释,只是每天晚上给他发我爱你,但言语太淡,我爱你,打出来只需要三秒,就是小派这位小留学生用拼音打也只要八秒钟就好了。

三秒钟的爱不够,太薄,在小派不屈不挠地要求下换成语音。

虽然用嘴巴说只有一秒钟,但从这一秒钟里,小派能感知到很多东西,比如小远当时的嗓音,正身处于什么环境,情绪是低落还是高涨,还有,藏在一秒里的很多很多爱。
而世上很多美好珍贵的东西都是被锁在一秒钟里的,就像照片定格的瞬间,烟花绽放的刹那,萌芽破土而出那一瞬息,还有小远糯着嗓子说出的我爱你。

三秒钟和一秒钟不一样,小派有讲究的。`},
  39:{title:`恋爱日记 · 第四篇`, text:`身为歌手的小远在各地飞,偶尔来北京也是两三天就赶着要去下一个地方。小派特别珍惜这两三天,总是尽可能地跟小远待在一起。
这天小远在北京的雪碧音乐节彩排,但彩排时间很长,小远让小派去旁边咖啡厅等他,小派想了想跑去了隔壁的溜冰场溜冰。
他一直想带小远去溜冰跟滑雪,在德国长大的他对这类活动适应良好,尤其想看小远站不稳扶着他滑的样子。
「如果有一天能和远哥结婚就好了。去欧洲或任何一个没有人找得到我们的地方……」

他在朋友圈发了一段话:
"Let's run away 🏃🏻🦋"
好想一起逃离,去到只有你跟我的地方。`},
  49:{title:`恋爱日记 · 第五篇`, text:`随着小远舞台越来越多,小派不断进组,两人的生活越发繁忙起来。
有时一天也说不到几句话,一个人发的消息另一个人总要很久之后才看到,一件有趣的事情往往都到诉说者没兴致了才能等来一句急匆匆的回复。
爱可以平淡,但不能销声匿迹。
当小远某一天发现,他已经四个月没见到小派时,他无来由地感到恐慌。
从每天几小时的电话粥,只是挂着电话听着彼此呼吸都感到幸福;到一周一句制式地我爱你,错过太多次电话而不敢回打电话给他,未接来电慢慢也就没有了。
炙热的爱意被自己浇熄了,繁忙已经不能做为他的借口。

他还爱着小派吗?无庸置疑地。但生活忙忙碌碌,习惯了另一方理所当然地主动,随时把自己的灵魂抛出去都可以被接住的安心感。
但这世上哪里会有天造地设的一对,有时候爱足够,但缘分到头,也是枉然。`},
  59:{title:`恋爱日记 · 第六篇`, text:`秋天,冷空气来了,云层一天比一天厚,直到再也兜不住雨,发泄似地下了一天一夜。在小派做完毕业小组作业的那天晚上,接到了小远打来的电话。
他几乎没犹豫直接接听了,那头却不说话,只能听见风声、雨声、呼吸声——那是他最熟悉的声音,即使隔着电话,他仿佛也能感受到那湿热的吐息。

半晌,他先开口打破沉默:"怎么了?"
"没事"电话那端的声音很艰涩,"刚下工,我们这下雨了,我想,北京也可能被淋湿。"
"我在家。"小派回。
"刚刚没想起来。"小远干巴巴笑了两下,"我只是觉得,如果雨一定要落下的话,那个时刻我们应该站在一起,撑同一把伞。"

在爱情里,小派从来就是最勇敢的,他不明白相爱的人为什么不能在一起,只是社会太复杂,需要解决的问题太多,一个人磕碰走不完这条路。但如果两个人肩挨着肩,雨过,总会天晴。

小派隔天在朋友圈发了一段话:
"morning sunshine☀️"`},
  69:{title:`恋爱日记 · 第七篇`, text:`那天之后,小远把工作重心迁来北京,他签了北京的经纪公司,拎着一行李箱脏衣服强势入驻小派家。
小派欢喜得很,提前买好了一冰箱零食饮料,又被小远以长身体的小孩不能吃太多零食为名耳提面命送走大部分给隔壁邻居。
小派死守着最后一包浪味仙藏匿在床头柜,在一个浓情蜜意的晚上被残忍发现并当场缴获。但夜还很长,没得吃的小派还有很多事可以做……刚甜蜜同居的两个人,过了好一段没羞没臊的日子。

爱情从来没有完美,不能称作童话,遇不到荆棘遍布的丛林,也不会长出充满魔法的长发,每个人都平凡又普通着,源于爱和热爱,不厌其烦地解决一些微不足道的问题、鸡毛蒜皮的小事,刮腻子般堆砌起泥砖瓦筑的墙体。

东补补,西扛扛,一块砖贴着一块砖,一堵墙挨着一堵墙。
再一回神,便见一个家了。`},
  79:{title:`恋爱日记 · 最终章`, text:`小派的电影陆陆续续上映,受到了一致好评,还有一部入围了戛纳电影节。恰巧小远最近得空,本想回家休整一下,架不住小派软磨硬泡,最终还是大包小包的陪着孩子去了法国。
法国饮食小远吃不惯,小孩的胃也早被他调理的和他一致,于是这次差点超重的行李箱里塞的全是中国的一些调味料,火锅底料、酸菜鱼料、麻辣香锅…小远到酒店的第一件事便是搜索最近的超市。小孩在法国几天虽然辛苦,却不瘦反胖,小远居功自傲,擅自安排了小派为他捏肩挠背一系列报恩服务。
电影节终于走向尾声,小远哼哧哼哧收拾好行李却被通知他们还要在法国呆两天,不明所以的他被临时导游小派带着游览了法国的特色建筑,等走到埃菲尔铁塔下已经是临近日落了。
天空是淡淡的橙,太阳悬在矮矮的树头,风在吹,很凉。小远往手里哈气,复又去抓小派的,却发现他手心微微出汗。这就是年轻人的火力啊,小远心道,想把手抽出塞回口袋保暖,却发现已经被人死死攥住。
"小远,"冷空气晕着塞纳尔湖淡淡的咸味,混着他俩身上相同的洗衣凝珠香气,裹挟着他的声音,羞怯怯送到小远耳朵里,
"我来法国之前在中介那里定了一套房子,是一间面海大平层,朝向好,光照足,有一个空中花园可以种花,当然,也可以种折耳根,我捏着鼻子就好了。
我们能永远永远爱着彼此吗?这段关系会被大家接受吗?这些问题我给不出答案,只是此刻,我的一颗真心,是完完全全在为你跳动。如果你愿意收下,我的这颗真心——

小远,你愿意和我结婚吗?"

小远心神紧绷,浑身血液涌到一处去,手指麻木失去知觉,天地间只剩下风声水声。一切都听不清、看不明,在熙熙攘攘的人群里,在月光垂爱的河畔边,在两人都不熟悉的异乡里,在两人都万分熟悉的彼此身边。
小派在说话吗?他在说什么?
看着呆愣的小远,小派笑着用干燥而温热的掌心挽起他的手。小远能感知到指节上的束缚,以及对方颤抖而冰冷的指尖。
原来他也在紧张吗?
唇瓣开合间,小远不记得自己说了什么,只记得那双微颤的手复将他捧起,温柔地盯着他泪光闪烁的双眼,轻轻地吻了上去。

他们说,真爱永恒。
于是,他们乘着爱,任岁月狂奔。

"I wish we could leave for once
Leave this world behind
With all the crimes and lies
Wish we could stop the time
A peaceful life by the sea
You sitting next to me."

希望我们能逃离现实,
把这个世界抛在脑后,连同所有的罪行和谎言
希望我们能停止时间,
在那平静的海边生活,你就静静地坐在我身边

"We could be at home by the sea
Just free
With the summer breeze, palm trees
Would worry bout nothin and nothin
Just laughing no rushing at home
you and me"

我们可以在那海边的家
只是自由地感受,那夏日的微风和棕榈树
什么都不用担心
只是开心地笑着,在家里没有任何的匆忙
只有你和我`},
};

// 把分数尾数取成玩家喜欢的 7 或 9,只会往下取整(不会让目标分数变得更高),例如 5184 -> 5179
function niceScore(raw){
  const lastDigit = raw % 10;
  if(lastDigit >= 9) return raw - (lastDigit - 9);
  if(lastDigit >= 7) return raw - (lastDigit - 7);
  return Math.floor(raw/10)*10 - 1;
}

/* ============================================================
   关卡参数化生成
   ============================================================ */
function generateLevelConfig(n){
  const isMilestone = MILESTONES.includes(n);
  const isSpecialLevel = isMilestone || MEMENTO_LEVELS.includes(n) || COUPLE_PHOTO_LEVELS.includes(n); // 小派/小远只在这些关卡顶替兔兔/狗狗出现

  // 50关前整体放宽(棋盘小、图案少、步数松),50关后再逐步拉回难度
  const size = n<=9?6 : n<=35?7 : n<=49?8 : 9; // 10-29关棋盘提前到7x7(原本10-20关还是6x6);50关棋盘并进9x9,让50/51关难度一致
  const tileTypes = n<=9?4 : n<=29?6 : n<=39?7 : n<=49?8 : n<=59?9 : n<=69?10 : 11; // 1-9蝴蝶/星星/兔兔/狗狗,10-29图案数提前跳到6(原本5),30+电影板+麦克风,40-49图案数提前跳到8(原本7),50+玫瑰+小狗,60+太阳,70+爱心
  const cellCount = size*size;

  let moves, targetScore, numFrozen;
  if(n<=49){
    // 有了远派金币技能后(尤其是只要1枚、不占步数的元素互换)前面关卡变太简单,
    // 步数/目标分/冰冻格都比原本拉紧一截;49关的步数收在18,跟50关后那段接续,
    // 不会在49→50关之间突然变松
    moves = Math.max(16, 25 - Math.floor(n/7));
    targetScore = Math.round(cellCount * (13 + n*0.78));
    numFrozen = Math.min(Math.floor(n/4), Math.floor(cellCount*0.18));
  } else {
    // 50关起改用跟51关同一套公式(n-50 的偏移量在n=50时刚好是0),
    // 50/51关就不会因为公式在两关中间切换而突然变难/变松,难度感受一致
    moves = Math.max(15, 18 - Math.floor((n-50)/5));
    // 目标分数用「每步预期分数」反推,依 59关7799分/79关9977分 两个锚点校准斜率(59/79都是里程碑关卡,
    // 分数还会再乘1.15)。50关后连击加成(4连*1.5/5连*2)撑住比之前更高的分数门槛,而不是单纯调低目标;
    // 狗狗兔兔组合的步数奖励原本70关后另外加码到+7/+9,但实测后期步数太松,已经拿掉那段改成统一+2。
    const scorePerMove = 257.377 + (n-50) * 11.06896;
    targetScore = Math.round(moves * scorePerMove);
    // 50关后图案种类从7种跳到9种,光是这样就更难凑成,冰冻格改用更缓的曲线跟更低的上限,
    // 避免开局动没两步就卡死重排
    numFrozen = Math.min(Math.floor(6 + (n-50)/3), Math.floor(cellCount*0.16));
  }

  if(isMilestone){
    moves += 4;
    targetScore = Math.round(targetScore*1.15);
    numFrozen = Math.min(numFrozen+2, Math.floor(cellCount*0.20));
  }
  targetScore = niceScore(targetScore);
  return { level:n, rows:size, cols:size, tileTypes, moves, targetScore, numFrozen, isMilestone, isSpecialLevel };
}

/* ============================================================
   存档
   ============================================================ */
function loadState(){
  const defaults = { unlockedLevel:1, totalCleared:0, mementos:[0], postcards:[], couplePhotos:[], diaryUnlocked:[], mementosSeen:0, postcardsSeen:0, couplePhotosSeen:0, lives:MAX_LIVES, nextRegenAt:null, homeTutorialSeen:false, levelTutorialSeen:false, endless:null, playerName:'', milestoneStats:emptyMilestoneStats(), milestoneHistory:{}, coins:0, piggyReadyAt:null, piggyClicksSinceJackpot:0, piggyJackpotThreshold:null };
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(raw) return Object.assign({}, defaults, JSON.parse(raw));
  }catch(e){}
  return defaults;
}
function saveState(){ localStorage.setItem(SAVE_KEY, JSON.stringify(STATE)); }

// 关卡编号中途调整过(纪念品 8/18/28...→7/17/27..., 日记 10/20/30...→9/19/29...),
// 已经在玩的存档要把旧编号迁移成新编号,否则会出现「首页数字跟相簿/地图对不上」的孤儿资料
const MEMENTO_MIGRATION = {8:7, 18:17, 28:27, 38:37, 48:47, 58:57, 68:67};
const DIARY_MIGRATION = {10:9, 20:19, 30:29, 40:39, 50:49, 60:59, 70:69};
function migrateState(state){
  state.mementos = [...new Set(state.mementos.map(v => MEMENTO_MIGRATION[v] ?? v))].filter(v => MEMENTO_LEVELS.includes(v));
  state.diaryUnlocked = [...new Set(state.diaryUnlocked.map(v => DIARY_MIGRATION[v] ?? v))].filter(v => MILESTONES.includes(v));
  // 补齐:关卡进度已经超过某个纪念品/日记触发点,但因为改版跳号等原因没被正常收集到的,直接补上
  MEMENTO_LEVELS.forEach(level=>{
    if(level < state.unlockedLevel && !state.mementos.includes(level)) state.mementos.push(level);
  });
  // 环球影城合照/泰国行合照原本算纪念品(41/57),现在移到明信片册的合照,同样用「关卡进度补齐」逻辑迁移
  COUPLE_PHOTO_LEVELS.forEach(level=>{
    if(level < state.unlockedLevel && !state.couplePhotos.includes(level)) state.couplePhotos.push(level);
  });
  MILESTONES.forEach(level=>{
    if(level < state.unlockedLevel && !state.diaryUnlocked.includes(level)) state.diaryUnlocked.push(level);
  });
  return state;
}

/* 存档备份碼:JSON -> UTF-8 安全的 base64,方便玩家複製貼上手動備份/還原 */
function encodeSaveCode(state){
  try{ return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); }
  catch(e){ return ''; }
}
function decodeSaveCode(code){
  try{ return JSON.parse(decodeURIComponent(escape(atob(code)))); }
  catch(e){ return null; }
}

let STATE = migrateState(loadState());
saveState();

/* ============================================================
   体力(爱心)系统
   ============================================================ */
function regenLives(){
  if(STATE.lives>=MAX_LIVES){ STATE.nextRegenAt=null; return; }
  if(!STATE.nextRegenAt){ STATE.nextRegenAt = Date.now()+REGEN_MS; saveState(); return; }
  const now = Date.now();
  let changed = false;
  while(STATE.lives<MAX_LIVES && now>=STATE.nextRegenAt){
    STATE.lives++;
    STATE.nextRegenAt += REGEN_MS;
    changed = true;
  }
  if(STATE.lives>=MAX_LIVES) STATE.nextRegenAt = null;
  if(changed) saveState();
}

function loseLife(){
  STATE.lives = Math.max(0, STATE.lives-1);
  if(!STATE.nextRegenAt) STATE.nextRegenAt = Date.now()+REGEN_MS;
  saveState();
}

function updateLivesUI(){
  const pill = document.getElementById('lives-pill');
  if(!pill) return;
  if(STATE.lives>=MAX_LIVES || !STATE.nextRegenAt){
    pill.innerHTML = `♥ x ${STATE.lives}`;
    return;
  }
  const remainMs = Math.max(0, STATE.nextRegenAt - Date.now());
  const mm = Math.floor(remainMs/60000);
  const ss = Math.floor((remainMs%60000)/1000);
  pill.innerHTML = `♥ x ${STATE.lives}<span class="regen">下一颗 ${mm}:${String(ss).padStart(2,'0')}</span>`;
}

let livesTimer = null;
function startLivesTimer(){
  stopLivesTimer();
  livesTimer = setInterval(()=>{ regenLives(); updateLivesUI(); updatePiggyUI(); }, 1000);
}
function stopLivesTimer(){
  if(livesTimer){ clearInterval(livesTimer); livesTimer=null; }
}

/* ============================================================
   存钱筒:每 3 小时可以点一次,开出 1~9 枚不等的远派金币,
   不像爱心系统有上限卡住,纯粹看时间到了没有,不设「每天最多领一次」的额外限制
   ============================================================ */
const PIGGY_INTERVAL_MS = 1*60*60*1000;
function isPiggyReady(){
  return !STATE.piggyReadyAt || Date.now() >= STATE.piggyReadyAt;
}
function updatePiggyUI(){
  const layer = document.getElementById('piggy-layer');
  if(layer) layer.classList.toggle('piggy-ready', isPiggyReady());
}
function updateCoinDisplays(){
  const c1 = document.getElementById('coin-count');
  if(c1) c1.textContent = STATE.coins;
  const c2 = document.getElementById('board-coin-count');
  if(c2) c2.textContent = STATE.coins;
}
function showCoinGainPopup(amount){
  const el = document.getElementById('coin-gain-popup');
  if(!el) return;
  const img = document.getElementById('coin-gain-img');
  document.getElementById('coin-gain-amount').textContent = amount>=79 ? `+${amount} 远派金币!!` : `+${amount} 远派金币`;
  el.hidden = false;
  // 每次点击随机显示金币正面或反面其中一张,停留1秒
  img.src = Math.random()<0.5 ? 'assets/effects/coin_big.webp' : 'assets/effects/coin2_big.webp';
  requestAnimationFrame(()=> el.classList.add('show'));
  clearTimeout(showCoinGainPopup.hideTimer);
  showCoinGainPopup.hideTimer = setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>{ el.hidden = true; }, 300);
  }, 1000);
}
// 章节结算画面的金币彩蛋:某项数字刚好凑到 79 或 97 给 79 枚大奖,超过 97 给 9 枚,超过 79 给 7 枚,其余不给
function coinRewardForCount(n){
  if(n===79 || n===97) return 79;
  if(n>97) return 9;
  if(n>79) return 7;
  return 0;
}
// 每领 15~30 次(次数随机,领到后重新抽下一次的门槛),必定触发一次+79 枚的大奖,当个小彩蛋惊喜
function rollPiggyReward(){
  if(!STATE.piggyJackpotThreshold) STATE.piggyJackpotThreshold = 15 + Math.floor(Math.random()*16);
  STATE.piggyClicksSinceJackpot++;
  if(STATE.piggyClicksSinceJackpot >= STATE.piggyJackpotThreshold){
    STATE.piggyClicksSinceJackpot = 0;
    STATE.piggyJackpotThreshold = 15 + Math.floor(Math.random()*16);
    return 79;
  }
  return Math.floor(Math.random()*9)+1; // 1~9 枚,均匀分布
}
function claimPiggyBank(){
  if(!isPiggyReady()) return;
  const gained = rollPiggyReward();
  STATE.coins += gained;
  STATE.piggyReadyAt = Date.now() + PIGGY_INTERVAL_MS;
  saveState();
  updateCoinDisplays();
  updatePiggyUI();
  showCoinGainPopup(gained);
}

/* 把某张整张画布图的指定 bbox 内容,以「cover」方式裁切填满一个固定尺寸的小方块(例如小图示/徽章) */
function applyIconCrop(el, imgUrl, bbox, boxW, boxH){
  const bw = bbox.x2-bbox.x1, bh = bbox.y2-bbox.y1;
  const scale = Math.max(boxW/bw, boxH/bh);
  const renderedW = bw*scale, renderedH = bh*scale;
  const offX = (boxW-renderedW)/2, offY = (boxH-renderedH)/2;
  el.style.backgroundImage = `url('${imgUrl}')`;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = `${CANVAS_W*scale}px ${CANVAS_H*scale}px`;
  el.style.backgroundPosition = `${offX-bbox.x1*scale}px ${offY-bbox.y1*scale}px`;
}

/* ============================================================
   首页分层美术:依容器高度换算画布缩放,让底图与图示叠图对齐
   ============================================================ */
function layoutHomeCanvas(){
  const wrap = document.getElementById('home-canvas');
  if(!wrap) return;
  const rect = wrap.getBoundingClientRect();
  if(rect.height===0) return;

  // 以房间本体(ROOM_BBOX)填满容器为基准做「满版」裁切,而不是用整张含透明边界的画布。
  // 但裁切幅度不能大到把恋爱日记/礼物/明信片这些贴边的按钮图案切掉,
  // 所以先算出「不会切到任何热区」的安全缩放上限,实际缩放取两者较小值。
  const bboxW = ROOM_BBOX.x2 - ROOM_BBOX.x1;
  const bboxH = ROOM_BBOX.y2 - ROOM_BBOX.y1;

  let safeScale = Infinity;
  Object.values(HOTSPOTS).forEach(b=>{
    const marginLeft = b.x1 - ROOM_BBOX.x1;
    const marginRight = ROOM_BBOX.x2 - b.x2;
    const denomL = bboxW - 2*marginLeft;
    const denomR = bboxW - 2*marginRight;
    if(denomL>0) safeScale = Math.min(safeScale, rect.width/denomL);
    if(denomR>0) safeScale = Math.min(safeScale, rect.width/denomR);
  });

  const scale = Math.min(rect.height/bboxH, safeScale);
  const renderedBboxW = bboxW * scale;
  const renderedBboxH = bboxH * scale;
  const offsetX = (rect.width - renderedBboxW) / 2;
  const offsetY = (rect.height - renderedBboxH) / 2;

  const fullW = CANVAS_W * scale;
  const fullH = CANVAS_H * scale;
  const layerLeft = offsetX - ROOM_BBOX.x1 * scale;
  const layerTop = offsetY - ROOM_BBOX.y1 * scale;

  wrap.querySelectorAll('.canvas-layer').forEach(img=>{
    img.style.left = layerLeft+'px';
    img.style.top = layerTop+'px';
    img.style.width = fullW+'px';
    img.style.height = fullH+'px';
  });

  Object.entries(HOTSPOTS).forEach(([key,b])=>{
    const el = document.getElementById('hotspot-'+key);
    if(!el) return;
    el.style.left = (layerLeft + b.x1*scale)+'px';
    el.style.top = (layerTop + b.y1*scale)+'px';
    el.style.width = ((b.x2-b.x1)*scale)+'px';
    el.style.height = ((b.y2-b.y1)*scale)+'px';

    const label = document.getElementById('hotspot-'+key+'-label');
    if(label){
      label.style.left = (layerLeft + (b.x1+b.x2)/2*scale)+'px';
      if(b.labelPos==='below'){
        label.style.top = (layerTop + b.y2*scale + 6)+'px';
        label.style.transform = 'translate(-50%,0)';
      } else {
        label.style.top = (layerTop + b.y1*scale - 8)+'px';
        label.style.transform = 'translate(-50%,-100%)';
      }
    }
  });

  // 进度牌:贴在头像按键正下方,水平置中;下缘再对齐「月兔大挑战」白字的下缘,让两边看起来一样高
  const progressPill = document.querySelector('.progress-pill');
  if(progressPill){
    progressPill.style.left = (layerLeft + PROGRESS_PILL_ANCHOR.x*scale)+'px';
    progressPill.style.top = (layerTop + PROGRESS_PILL_ANCHOR.y*scale)+'px';
    progressPill.style.transform = 'translate(-50%,0)';
    const endlessLabel = document.getElementById('hotspot-endless-label');
    if(endlessLabel){
      const labelBottom = endlessLabel.getBoundingClientRect().bottom;
      const wrapTop = wrap.getBoundingClientRect().top;
      progressPill.style.top = (labelBottom - wrapTop - progressPill.offsetHeight)+'px';
    }
  }
  // 爱心牌:左边缘贴着恋爱日记图示右侧,垂直置中对齐该图示
  const livesPill = document.getElementById('lives-pill');
  if(livesPill){
    livesPill.style.left = (layerLeft + LIVES_PILL_ANCHOR.x*scale)+'px';
    livesPill.style.top = (layerTop + LIVES_PILL_ANCHOR.y*scale)+'px';
    livesPill.style.transform = 'translate(0,-50%)';
  }
  // 金币牌:贴在存钱筒图示正下方,水平置中
  const coinPill = document.getElementById('coin-pill');
  if(coinPill){
    coinPill.style.left = (layerLeft + COIN_PILL_ANCHOR.x*scale)+'px';
    coinPill.style.top = (layerTop + COIN_PILL_ANCHOR.y*scale)+'px';
    coinPill.style.transform = 'translate(-50%,0)';
  }
}
window.addEventListener('resize', ()=>{
  if(document.getElementById('screen-home').classList.contains('active')) layoutHomeCanvas();
});

/* ============================================================
   画面切换
   ============================================================ */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  stopLivesTimer();
  if(id==='screen-home'){
    refreshHome();
    layoutHomeCanvas();
    startLivesTimer();
    maybeShowHomeTutorial();
  }
  if(id==='screen-map') refreshMap();
}

document.querySelectorAll('[data-back]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const target = btn.dataset.back;
    // 无尽挑战关不算在79关地图里,从这关返回要直接回首页,不是回关卡地图
    if(target==='map' && BOARD && BOARD.endless){ showScreen('screen-home'); return; }
    showScreen(target==='home' ? 'screen-home' : 'screen-'+target);
    // 过关时点「去纪念品册/明信片册看看」跳过去看收藏,如果后面还有排队中的弹窗
    // (小远回家/拉霸机等)没播完,回到首页时要接着播完,不能整串直接消失
    if(modalQueue.length>0) showNextModal();
  });
});
document.getElementById('btn-board-help').addEventListener('click', ()=> showModalQueue([{type:'skills'}], 'screen-board'));
document.getElementById('board-coin-btn').addEventListener('click', openCoinSkillsModal);
document.getElementById('hotspot-endless').addEventListener('click', openEndlessBoard);
document.getElementById('hotspot-piggy').addEventListener('click', claimPiggyBank);
document.getElementById('btn-endless-submit').addEventListener('click', ()=> showModalQueue([{type:'endless-submit'}], 'screen-board'));
document.getElementById('btn-endless-rank').addEventListener('click', ()=> showModalQueue([{type:'leaderboard'}], 'screen-board'));
document.getElementById('btn-endless-restart').addEventListener('click', ()=>{
  if(!confirm('确定重来？')) return;
  if(!confirm('之前养的月兔会全部放归，你确定重来？')) return;
  resetEndlessBoard();
});

/* 第一次打开首页时,依序闪烁介绍三个按键,dismiss 后写 flag 永远不再跳出。
   同一份文字之后也收录在头像按键(hotspot-avatar)打开的「游戏玩法」分页,方便玩家随时回看。 */
const HOME_TOUR_STEPS = [
  { id:'hotspot-diary',    text:`79关消消乐小关卡，解锁小派跟小远的恋爱日记。` },
  { id:'hotspot-gift',     text:`小远送的礼物、生活回忆的纪念品……收集这些承载浪漫故事的物品，来一点点装饰家中各个角落。` },
  { id:'hotspot-postcard', text:`收藏了小远在外巡演寄回来的明信片及两人出游的合照，可以随时翻阅。` },
  { id:'hotspot-piggy',    text:`<b>恋爱存款</b>：谈恋爱总是要花钱，小派在桌上放了个存钱筒，每天存一点，存到能够给小远买礼物。每1小时存钱筒会累积不等数金币，点击领取远派金币，可在关卡内购买特殊技能。` },
];
let homeTourEls = null;
function maybeShowHomeTutorial(){
  if(STATE.homeTutorialSeen) return;
  STATE.homeTutorialSeen = true;
  saveState();
  runHomeTourStep(0);
}
function runHomeTourStep(i){
  if(i>=HOME_TOUR_STEPS.length){ endHomeTour(); return; }
  const step = HOME_TOUR_STEPS[i];
  const wrap = document.getElementById('home-canvas');
  const target = document.getElementById(step.id);
  if(!target){ runHomeTourStep(i+1); return; }
  if(!homeTourEls){
    const dim = document.createElement('div'); dim.className = 'tour-dim';
    const hi = document.createElement('div'); hi.className = 'tour-highlight';
    const cap = document.createElement('div'); cap.className = 'tour-caption';
    wrap.appendChild(dim); wrap.appendChild(hi); wrap.appendChild(cap);
    homeTourEls = { dim, hi, cap };
  }
  const wrapRect = wrap.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const left = rect.left - wrapRect.left, top = rect.top - wrapRect.top;
  homeTourEls.hi.style.left = left+'px';
  homeTourEls.hi.style.top = top+'px';
  homeTourEls.hi.style.width = rect.width+'px';
  homeTourEls.hi.style.height = rect.height+'px';

  let capTop = top + rect.height + 12;
  if(capTop + 130 > wrapRect.height) capTop = Math.max(10, top - 130 - 12);
  let capLeft = left + rect.width/2 - 110;
  capLeft = Math.max(10, Math.min(capLeft, wrapRect.width - 230));
  homeTourEls.cap.style.left = capLeft+'px';
  homeTourEls.cap.style.top = capTop+'px';
  const isLast = i===HOME_TOUR_STEPS.length-1;
  homeTourEls.cap.innerHTML = `<p>${step.text}</p><button id="tour-next">${isLast?'知道了':'下一步'}</button>`;
  document.getElementById('tour-next').addEventListener('click', ()=> runHomeTourStep(i+1));
}
function endHomeTour(){
  if(!homeTourEls) return;
  homeTourEls.dim.remove(); homeTourEls.hi.remove(); homeTourEls.cap.remove();
  homeTourEls = null;
}

/* ============================================================
   首页
   ============================================================ */
function xiaoyuanCycleInfo(){
  const cleared = STATE.totalCleared;
  const pos = cleared % HOME_CYCLE;
  const isHome = cleared>0 && pos===0 && cleared<TOTAL_LEVELS;
  const remaining = isHome ? 0 : (HOME_CYCLE - pos);
  return { isHome, remaining };
}

function refreshHome(){
  regenLives();
  updateLivesUI();
  updatePiggyUI();
  updateCoinDisplays();
  const lvl = Math.min(STATE.unlockedLevel, TOTAL_LEVELS);
  document.getElementById('home-level-text').textContent =
    STATE.unlockedLevel > TOTAL_LEVELS ? `完结 · 已结婚 💍` : `第 ${lvl} 关 / 共 ${TOTAL_LEVELS} 关`;
  document.getElementById('home-progress-fill').style.width =
    Math.min(100, STATE.totalCleared/TOTAL_LEVELS*100)+'%';
  document.getElementById('gift-count').hidden = STATE.mementos.length <= STATE.mementosSeen;
  document.getElementById('postcard-count').hidden =
    (STATE.postcards.length + STATE.couplePhotos.length) <= (STATE.postcardsSeen + STATE.couplePhotosSeen);

  const info = xiaoyuanCycleInfo();
  const statusEl = document.getElementById('xiaoyuan-status');
  if(STATE.unlockedLevel > TOTAL_LEVELS){
    statusEl.textContent = '小远每天都在家了 🏠💍';
  } else if(info.isHome){
    statusEl.textContent = '小远在家 🏠(厨房或床上找找看)';
  } else {
    statusEl.textContent = `小远出差中 ✈️ 还有 ${info.remaining} 关回家`;
  }
  updateHomeCharacters(info);
  updateHomeMementos(info);
}

/* 已收集的纪念品会以整张画布(2048x3200)贴图的形式,出现在娃娃屋里各自的定点位置(跟角色立绘同一套裁切逻辑)。
   图档命名规则:assets/home_items/{关卡数字}.png,例如 assets/home_items/0.png。
   还没画好的项目直接读不到图就整层隐藏,不会出现破图。 */
let mementoHomeLayers = null;
function setupMementoHomeLayers(){
  if(mementoHomeLayers) return;
  mementoHomeLayers = {};
  const wrap = document.getElementById('home-canvas');
  const firstCharLayer = document.getElementById('char-desk-read'); // 纪念品图层要插在角色立绘「之前」,确保人物站在纪念品前面,不会被小物件盖住
  MEMENTO_LEVELS.forEach(level=>{
    const img = document.createElement('img');
    img.className = 'canvas-layer memento-home-layer';
    img.alt = '';
    img.hidden = true;
    img.addEventListener('error', ()=>{ img.dataset.broken = '1'; img.hidden = true; });
    // 不在这里马上设 src,等真的收集到才载入,避免首页一开始就打一堆图还没画好的请求拖慢载入
    wrap.insertBefore(img, firstCharLayer);
    mementoHomeLayers[level] = img;
  });
}
function updateHomeMementos(info){
  setupMementoHomeLayers();
  MEMENTO_LEVELS.forEach(level=>{
    const img = mementoHomeLayers[level];
    if(img.dataset.broken) return;
    let show = STATE.mementos.includes(level);
    // 蝴蝶结卫衣(7号):小派想小远的时候才会偷穿,只在小远不在家、且每 5 关才出现一次,不是常驻展示
    if(level===7){
      show = show && !info.isHome && (STATE.totalCleared % 5 === 0);
    }
    if(show && !img.src){
      img.src = `assets/home_items/${level}.png`; // 到这时候才真的载入图片
    }
    img.hidden = !show;
  });
}

/* 首页娃娃屋里的角色立绘:小远在家时厨房两人一起,不在家时小派独自在屋里的不同角落 */
const AWAY_POSE_ORDER = ['char-desk-read', 'char-sofa-tv', 'char-bed-idle'];
function updateHomeCharacters(info){
  const allChars = ['char-desk-read','char-sofa-tv','char-bed-idle','char-sofa-kitchen','char-kitchen-cook'];
  allChars.forEach(id => document.getElementById(id).hidden = true);

  const married = STATE.unlockedLevel > TOTAL_LEVELS;
  if(married || info.isHome){
    document.getElementById('char-kitchen-cook').hidden = false;
    document.getElementById('char-sofa-kitchen').hidden = false;
  } else {
    const pos = STATE.totalCleared % HOME_CYCLE;
    document.getElementById(AWAY_POSE_ORDER[pos % 3]).hidden = false;
  }
}

document.getElementById('hotspot-avatar').addEventListener('click', ()=> showModalQueue([{type:'about'}], 'screen-home'));
document.getElementById('hotspot-diary').addEventListener('click', ()=> showScreen('screen-map'));
document.getElementById('hotspot-gift').addEventListener('click', ()=> openAlbum('memento'));
document.getElementById('hotspot-postcard').addEventListener('click', ()=> openAlbum('postcard'));
document.getElementById('btn-reset').addEventListener('click', ()=>{
  if(!confirm('确定要重新体验两人爱情故事吗?')) return;
  if(!confirm('确定要重置所有进度(包含金币跟已收集品)吗?')) return;
  localStorage.removeItem(SAVE_KEY);
  STATE = loadState();
  refreshHome();
});
document.getElementById('btn-backup').addEventListener('click', ()=> showModalQueue([{type:'backup'}], 'screen-home'));

/* ============================================================
   关卡地图
   ============================================================ */
function refreshMap(){
  const list = document.getElementById('map-list');
  list.innerHTML = '';

  // 第 0 关:楔子,永远可点,直接显示恋爱日记卡片,不进消消乐
  const wrap0 = document.createElement('div');
  wrap0.className = 'map-node-wrap';
  const node0 = document.createElement('button');
  node0.className = 'map-node map-node-diary0';
  node0.title = '恋爱日记 · 楔子';
  applyIconCrop(node0, 'assets/ui/icon_diary.png', HOTSPOTS.diary, 56, 56);
  node0.addEventListener('click', ()=> showModalQueue([{type:'diary', level:0, reread:true}]));
  wrap0.appendChild(node0);
  list.appendChild(wrap0);

  for(let n=1; n<=TOTAL_LEVELS; n++){
    const wrap = document.createElement('div');
    wrap.className = 'map-node-wrap';
    wrap.dataset.level = n;

    const btn = document.createElement('button');
    const milestone = MILESTONES.includes(n);
    let cls = 'map-node ';
    if(n < STATE.unlockedLevel) cls += 'cleared';
    else if(n === STATE.unlockedLevel) cls += 'unlocked';
    else cls += 'locked';
    if(milestone) cls += ' milestone';
    btn.className = cls;
    btn.textContent = n;
    if(n <= STATE.unlockedLevel){
      btn.addEventListener('click', ()=> openBoard(n));
    }
    wrap.appendChild(btn);

    // 已解锁的日记篇章:显示可重复点阅的小书本图示
    if(milestone && STATE.diaryUnlocked.includes(n)){
      const heart = document.createElement('button');
      heart.className = 'diary-heart-btn';
      heart.title = '重读这篇恋爱日记';
      applyIconCrop(heart, 'assets/ui/icon_diary.png', HOTSPOTS.diary, 28, 28);
      heart.addEventListener('click', (e)=>{
        e.stopPropagation();
        const rereadQueue = [{type:'diary', level:n, reread:true}];
        if(n === TOTAL_LEVELS) rereadQueue.push({type:'ending', reread:true});
        showModalQueue(rereadQueue);
      });
      wrap.appendChild(heart);
    }

    // 已结算过的远派金币章节:显示可重复点阅的小金币图示
    if(milestone && STATE.milestoneHistory[n]){
      const coinBtn = document.createElement('button');
      coinBtn.className = 'milestone-coin-btn';
      coinBtn.title = '查看这一章的远派恋爱金币结算';
      coinBtn.innerHTML = '<img src="assets/ui/coin.webp" alt="">';
      coinBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const rec = STATE.milestoneHistory[n];
        showModalQueue([{type:'milestone-summary', level:n, stats:rec.stats, rewards:rec.rewards, totalCoins:rec.totalCoins, reread:true}]);
      });
      wrap.appendChild(coinBtn);
    }

    list.appendChild(wrap);
  }
  // 卷动到目前正在挑战的那一关(而不是每次都跳回最底部的第1关)
  requestAnimationFrame(()=>{
    const targetLevel = Math.min(STATE.unlockedLevel, TOTAL_LEVELS);
    const targetWrap = list.querySelector(`.map-node-wrap[data-level="${targetLevel}"]`);
    if(targetWrap){
      targetWrap.scrollIntoView({block:'center'});
    } else {
      list.scrollTop = list.scrollHeight;
    }
  });
}

/* ============================================================
   收藏册
   ============================================================ */
function openAlbum(type){
  const grid = document.getElementById('album-grid');
  grid.innerHTML = '';

  if(type==='memento'){
    STATE.mementosSeen = STATE.mementos.length;
    saveState();
    document.getElementById('album-title').textContent = '已收集纪念品';
    MEMENTO_LEVELS.forEach(level=>{
      const item = MEMENTO_ITEMS[level];
      const has = STATE.mementos.includes(level);
      const div = document.createElement('div');
      div.className = 'album-item ' + (has ? '' : 'locked');
      const photoInner = has && item.img ? `<img src="${item.img}" alt="">` : (has ? '💝' : '？');
      div.innerHTML = `
        <div class="album-item-circle-wrap"><div class="album-item-circle">${photoInner}</div></div>
        <div class="album-item-label">${has ? item.name : ''}</div>`;
      div.title = has ? item.name : '尚未收集';
      if(has){
        div.style.cursor = 'pointer';
        div.addEventListener('click', ()=> showModalQueue([{type:'memento', level, reread:true}], 'screen-home'));
      }
      grid.appendChild(div);
    });
  } else {
    STATE.postcardsSeen = STATE.postcards.length;
    STATE.couplePhotosSeen = STATE.couplePhotos.length;
    saveState();
    document.getElementById('album-title').textContent = '已收集明信片册';
    POSTCARD_ITEMS.forEach((label,i)=>{
      const has = STATE.postcards.includes(i);
      const div = document.createElement('div');
      div.className = 'album-item ' + (has ? '' : 'locked');
      const photoInner = has ? label.split(' ')[0] : '？';
      const caption = has ? label.split(' ').slice(1).join(' ') : '';
      div.innerHTML = `
        <div class="album-item-circle-wrap"><div class="album-item-circle">${photoInner}</div></div>
        <div class="album-item-label">${caption}</div>`;
      div.title = has ? label : '尚未收集';
      grid.appendChild(div);
    });
    // 两人出游的合照:相簿格只显示照片本身,不带文字说明,点进去才看故事
    COUPLE_PHOTO_LEVELS.forEach(level=>{
      const item = COUPLE_PHOTO_ITEMS[level];
      const has = STATE.couplePhotos.includes(level);
      const div = document.createElement('div');
      div.className = 'album-item album-item-photo-only ' + (has ? '' : 'locked');
      const photoInner = has && item.img ? `<img src="${item.img}" alt="">` : (has ? '💌' : '？');
      div.innerHTML = `<div class="album-item-circle-wrap"><div class="album-item-circle">${photoInner}</div></div>`;
      div.title = has ? item.name : '尚未收集';
      if(has){
        div.style.cursor = 'pointer';
        div.addEventListener('click', ()=> showModalQueue([{type:'memento', level, source:'couple', reread:true}], 'screen-home'));
      }
      grid.appendChild(div);
    });
  }
  showScreen('screen-album');
}

/* ============================================================
   消消乐引擎
   ============================================================ */
let BOARD = null;        // { rows, cols, cells:[[{type,frozen}|null]], config, score, moves, busy }
let selectedCell = null; // {r,c}
let pointerDrag = null;  // {r,c,x,y}

function openBoard(levelNum){
  regenLives();
  if(STATE.lives<=0){
    showModalQueue([{type:'nolives'}]);
    return;
  }
  const cfg = generateLevelConfig(levelNum);
  BOARD = {
    config: cfg,
    cells: null,
    score: 0,
    movesLeft: cfg.moves,
    busy: false,
    endless: false,
    dogfacePending: 0,
    bunnyPending: 0,
    rabbitCount: 0,
    fullMoonCount: 0,
  };
  BOARD.cells = generateSolvableBoard(cfg);
  renderRabbitTray();

  document.getElementById('board-level-title').textContent = `第 ${levelNum} 关`;
  const badge = document.getElementById('board-milestone-badge');
  badge.hidden = !cfg.isMilestone;
  document.querySelector('.board-moves').innerHTML = `步数 <span id="board-moves-left">${BOARD.movesLeft}</span>`;
  document.getElementById('board-score-current').textContent = 0;
  document.getElementById('board-score-target').textContent = cfg.targetScore;
  document.getElementById('board-score-fill').style.width = '0%';
  document.querySelector('.board-score-wrap').hidden = false;
  document.getElementById('endless-panel').hidden = true;
  updateCoinDisplays();
  exitCoinSwapMode();
  exitBottlePickMode();

  selectedCell = null;
  showScreen('screen-board');
  renderBoard();

  if(!STATE.levelTutorialSeen){
    STATE.levelTutorialSeen = true;
    saveState();
    showModalQueue([{type:'tutorial-level'}], 'screen-board');
  }
}

/* ============================================================
   无尽挑战关:没有步数/分数上限,想玩多久玩多久,进度持续存档,
   累计月兔数量可以上传到公开排行榜(Cloudflare Worker,见 LEADERBOARD_API)
   ============================================================ */
const ENDLESS_ROWS = 9, ENDLESS_COLS = 9;
function endlessConfig(){
  // level 故意设 79,让蝴蝶/太阳特效、月亮/兔兔/狗狗权重加成全部都是满级效果
  return { level:79, rows:ENDLESS_ROWS, cols:ENDLESS_COLS, tileTypes:11, moves:Infinity, targetScore:Infinity, numFrozen:0, isMilestone:false, isSpecialLevel:false };
}
function emptyEndlessStats(){
  return { bunnyMatches:0, dogfaceMatches:0, butterflyBursts:0, sunBursts:0, moonBombs:0, moonPoundings:0 };
}
// 恋爱日记章节(9/19/29...79关)之间累计的战绩,每次章节结算完就归零重新算
function emptyMilestoneStats(){
  return { bunnyMatches:0, dogfaceMatches:0, rabbitsGained:0, moonBombs:0, moonPoundings:0, butterflyBursts:0, sunBursts:0 };
}
// 「月兔数量」现场结算:兔兔+满月*3,用月兔捣药技能把满月拖到棋盘上花掉之后,这个数字会跟着倒扣
function endlessRabbitTotal(src){
  return (src.rabbitCount||0) + (src.fullMoonCount||0)*3;
}
function openEndlessBoard(){
  const cfg = endlessConfig();
  const saved = STATE.endless;
  BOARD = {
    config: cfg,
    cells: null,
    score: 0,
    movesLeft: Infinity,
    busy: false,
    endless: true,
    dogfacePending: 0,
    bunnyPending: 0,
    rabbitCount: 0,
    fullMoonCount: 0,
    stats: emptyEndlessStats(),
  };
  if(saved && saved.cells && saved.cells.length===cfg.rows && saved.cells[0].length===cfg.cols){
    BOARD.cells = saved.cells;
    BOARD.rabbitCount = saved.rabbitCount||0;
    BOARD.fullMoonCount = saved.fullMoonCount||0;
    BOARD.dogfacePending = saved.dogfacePending||0;
    BOARD.bunnyPending = saved.bunnyPending||0;
    BOARD.score = saved.score||0;
    BOARD.stats = Object.assign(emptyEndlessStats(), saved.stats||{});
  } else {
    BOARD.cells = generateSolvableBoard(cfg);
  }
  renderRabbitTray();

  document.getElementById('board-level-title').textContent = `月兔大挑战`;
  document.getElementById('board-milestone-badge').hidden = true;
  document.querySelector('.board-moves').innerHTML = `🐇月兔 <span id="board-moves-left">${endlessRabbitTotal(BOARD)}</span>`;
  document.querySelector('.board-score-wrap').hidden = true;
  document.getElementById('endless-panel').hidden = false;
  renderEndlessStats();

  selectedCell = null;
  showScreen('screen-board');
  renderBoard();
}
function resetEndlessBoard(){
  STATE.endless = null;
  saveState();
  openEndlessBoard();
}
function renderEndlessStats(){
  const el = document.getElementById('endless-stats');
  if(!el || !BOARD || !BOARD.endless) return;
  document.getElementById('board-moves-left').textContent = endlessRabbitTotal(BOARD);
  el.innerHTML = `
    <span>🐰兔兔组合 <b>${BOARD.stats.bunnyMatches}</b></span>
    <span>🐶狗狗组合 <b>${BOARD.stats.dogfaceMatches}</b></span>
    <span>🦋私奔蝴蝶 <b>${BOARD.stats.butterflyBursts}</b></span>
    <span>☀️早安太阳 <b>${BOARD.stats.sunBursts}</b></span>
    <span>🌕月亮合体 <b>${BOARD.stats.moonBombs}</b></span>
    <span>🌝月兔捣药 <b>${BOARD.stats.moonPoundings}</b></span>
    <span>💰积分 <b>${BOARD.score}</b></span>`;
}
function saveEndlessProgress(){
  if(!BOARD || !BOARD.endless) return;
  STATE.endless = {
    cells: BOARD.cells,
    rabbitCount: BOARD.rabbitCount,
    fullMoonCount: BOARD.fullMoonCount,
    dogfacePending: BOARD.dogfacePending,
    bunnyPending: BOARD.bunnyPending,
    score: BOARD.score,
    stats: BOARD.stats,
  };
  saveState();
  renderEndlessStats();
}

/* 排行榜:呼叫 LEADERBOARD_API(Cloudflare Worker)。网址还没换成真的之前会直接回传错误,
   呼叫端要处理失败情况(不能让排行榜功能挡住正常游玩)。 */
async function submitLeaderboardScore(name){
  const src = (BOARD && BOARD.endless) ? BOARD : (STATE.endless || {});
  const stats = src.stats || emptyEndlessStats();
  const res = await fetch(LEADERBOARD_API + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      rabbits: endlessRabbitTotal(src),
      score: src.score||0,
      bunnyMatches: stats.bunnyMatches,
      dogfaceMatches: stats.dogfaceMatches,
      butterflyBursts: stats.butterflyBursts,
      sunBursts: stats.sunBursts,
      moonPoundings: stats.moonPoundings,
      moonBombs: stats.moonBombs,
    }),
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || 'submit_failed');
  return data.entries;
}
async function fetchLeaderboard(){
  const res = await fetch(LEADERBOARD_API + '/leaderboard');
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || 'fetch_failed');
  return data.entries;
}
// 9个称号,依据排行榜里各项数字目前的最高持有人现场判定,会随时间变动(别人上传新成绩就可能换人)
const ACHIEVEMENT_TITLES = [
  { key:'rabbits',         icon:'👑', name:'月兔国国王' },
  { key:'dogfaceMatches',  icon:'🐶', name:'最爱狗狗的人' },
  { key:'bunnyMatches',    icon:'🐰', name:'最爱兔兔的人' },
  { compute:e=>(e.butterflyBursts||0)+(e.sunBursts||0)+(e.moonBombs||0)+(e.moonPoundings||0), icon:'🍵', name:'最游刃有余的人' },
  { key:'butterflyBursts', icon:'🦋', name:'最想私奔的蝴蝶恋人' },
  { key:'sunBursts',       icon:'☀️', name:'被放闪闪瞎眼的人' },
  { key:'moonBombs',       icon:'🌕', name:'代表月亮惩罚你' },
  { key:'score',           icon:'💰', name:'最富有的人' },
  { key:'moonPoundings',   icon:'💊', name:'月兔国最大药头' },
];
function renderTitleHolders(entries){
  const el = document.getElementById('title-list');
  if(!el) return;
  el.innerHTML = ACHIEVEMENT_TITLES.map(t=>{
    let best = null;
    (entries||[]).forEach(e=>{
      const v = t.compute ? t.compute(e) : (e[t.key]||0);
      if(v>0 && (!best || v>best.value)) best = { name:e.name, value:v };
    });
    return `<div class="title-row">
      <span class="title-icon">${t.icon}</span>
      <span class="title-name">${t.name}</span>
      <span class="title-holder">${best ? escapeHtml(best.name)+' · '+best.value : '尚无人达成'}</span>
    </div>`;
  }).join('');
}
function renderLeaderboardList(entries){
  renderTitleHolders(entries);
  const el = document.getElementById('leaderboard-list');
  if(!el) return;
  if(!entries || entries.length===0){
    el.innerHTML = `<p style="text-align:center;color:var(--ink-soft);">还没有人上传成绩,当第一个吧!</p>`;
    return;
  }
  el.innerHTML = entries.map((e,i)=> `
    <div class="leaderboard-row ${i<3?'top3':''}">
      <div class="leaderboard-rank">${i+1}</div>
      <div style="flex:1;min-width:0;">
        <div class="leaderboard-name">${escapeHtml(e.name)}</div>
        <div class="leaderboard-detail">🐰${e.bunnyMatches||0} 🐶${e.dogfaceMatches||0} 🦋${e.butterflyBursts||0} ☀️${e.sunBursts||0} 🐇${e.moonPoundings||0}</div>
      </div>
      <div class="leaderboard-rabbits">🐇${e.rabbits}</div>
    </div>`).join('');
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const MOON_WEIGHT = 0.5;       // 60关前:月亮出现权重只有其他图案的一半,避免炸弹太频繁让关卡变得太轻松
const MOON_BOOST_WEIGHT = 1.2; // 60关后:月亮出现权重提高,帮助玩家更容易凑出特殊清版效果

// 蝴蝶整排特效40关解锁(见 resolveCascade),但出现权重要到60关才跟着提高(40-59关维持基准权重1,
// 这段只是解锁清版能力,不额外加码出现机率);太阳十字特效60关解锁,权重也是60关才开始提高
function butterflyBoostWeight(level){
  return level >= 60 ? 1.2 : 1;
}
function sunBoostWeight(level){
  if(level < 60) return 1;
  const t = Math.min(level, 79);
  return 1.2 + (t-60) * (0.4/19);
}
// 40关起,兔兔/小派、狗狗/小远出现权重提高,帮玩家更容易凑出「一组狗狗+一组兔兔」召唤月兔
function bunnyDogfaceBoostWeight(level){
  if(level < 40) return 1;
  const t = Math.min(level, 79);
  return 1.4 + (t-40) * (1.0/39);
}

/* 剧情/纪念品关卡:抽到兔兔/狗狗时直接顶替成小派/小远,图案总数不变 */
function pickType(cfg){
  const n = cfg.tileTypes;
  const level = cfg.level;
  let totalWeight = 0;
  const weights = [];
  for(let i=0;i<n;i++){
    let w = 1;
    if(i===MOONFACE_IDX) w = level>=60 ? MOON_BOOST_WEIGHT : MOON_WEIGHT;
    else if(i===SUN_IDX) w = sunBoostWeight(level);
    else if(i===BUTTERFLY_IDX) w = butterflyBoostWeight(level);
    else if(i===BUNNY_IDX || i===DOGFACE_IDX) w = bunnyDogfaceBoostWeight(level);
    weights.push(w);
    totalWeight += w;
  }
  let r = Math.random()*totalWeight;
  let t = n-1;
  for(let i=0;i<n;i++){
    if(r < weights[i]){ t = i; break; }
    r -= weights[i];
  }
  if(cfg.isSpecialLevel){
    if(t===BUNNY_IDX) return XIAOPAI_IDX;
    if(t===DOGFACE_IDX) return XIAOYUAN_IDX;
  }
  return t;
}

function generateSolvableBoard(cfg){
  let cells, tries=0;
  do{
    cells = fillNoInitialMatches(cfg);
    placeFrozen(cells, cfg);
    tries++;
  }while(!hasPossibleMove(cells, cfg) && tries<25);
  return cells;
}

function fillNoInitialMatches(cfg){
  const {rows, cols} = cfg;
  const cells = [];
  for(let r=0;r<rows;r++){
    const row=[];
    for(let c=0;c<cols;c++){
      let t;
      let attempt=0;
      do{
        t = pickType(cfg);
        attempt++;
      }while(attempt<10 && (
        (c>=2 && row[c-1] && row[c-2] && row[c-1].type===t && row[c-2].type===t) ||
        (r>=2 && cells[r-1][c] && cells[r-2][c] && cells[r-1][c].type===t && cells[r-2][c].type===t)
      ));
      row.push({type:t, frozen:false});
    }
    cells.push(row);
  }
  return cells;
}

function placeFrozen(cells, cfg){
  const {rows, cols, numFrozen} = cfg;
  let placed = 0;
  let guard = 0;
  while(placed < numFrozen && guard < numFrozen*20){
    guard++;
    const r = Math.floor(Math.random()*rows);
    const c = Math.floor(Math.random()*cols);
    if(!cells[r][c].frozen){
      cells[r][c].frozen = true;
      placed++;
    }
  }
}

function inBounds(r,c,cfg){ return r>=0 && r<cfg.rows && c>=0 && c<cfg.cols; }

function hasPossibleMove(cells, cfg){
  const dirs = [[0,1],[1,0]];
  for(let r=0;r<cfg.rows;r++){
    for(let c=0;c<cfg.cols;c++){
      if(cells[r][c].frozen) continue;
      for(const [dr,dc] of dirs){
        const nr=r+dr, nc=c+dc;
        if(!inBounds(nr,nc,cfg) || cells[nr][nc].frozen) continue;
        swapCells(cells, r,c,nr,nc);
        const m = findMatches(cells, cfg).matched.size>0;
        swapCells(cells, r,c,nr,nc);
        if(m) return true;
      }
    }
  }
  return false;
}

/* 盘面卡死(没有任何可交换组合)时原地洗牌,不用整关重来 */
function reshuffleBoard(cfg){
  let tries = 0;
  do{
    const flat = [];
    for(let r=0;r<cfg.rows;r++) for(let c=0;c<cfg.cols;c++) flat.push(BOARD.cells[r][c].type);
    for(let i=flat.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }
    let idx = 0;
    for(let r=0;r<cfg.rows;r++) for(let c=0;c<cfg.cols;c++) BOARD.cells[r][c].type = flat[idx++];
    tries++;
  }while((findMatches(BOARD.cells, cfg).matched.size>0 || !hasPossibleMove(BOARD.cells, cfg)) && tries<60);
}

let boardToastTimer = null;
function showBoardToast(msg, duration){
  let el = document.getElementById('board-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'board-toast';
    el.className = 'board-toast';
    document.getElementById('screen-board').appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(boardToastTimer);
  boardToastTimer = setTimeout(()=> el.classList.remove('show'), duration||1600);
}

// 预先把特效图载入浏览器缓存并解码好,避免技能第一次触发时才现抓图/现解码造成的画面卡顿
['assets/effects/moon_burst.jpg','assets/effects/sun_burst.webp','assets/effects/butterfly_burst.webp'].forEach(src=>{
  const im = new Image();
  im.src = src;
});

// 各特效图的显示时长,给自己的自动隐藏计时器用,也给下面「多个特效排队播放」用,只有这一份数字来源
const BURST_DURATIONS = { moon:1000, sun:1300, butterfly:1600, swap:1600, companion:1600, catchStar:1600, bottleCollect:1600, loveFull:1600 };

let moonBurstTimer = null;
function showMoonBurst(){
  let el = document.getElementById('moon-burst');
  if(!el){
    el = document.createElement('div');
    el.id = 'moon-burst';
    el.className = 'moon-burst';
    el.innerHTML = `<img src="assets/effects/moon_burst.jpg" alt="">`;
    document.getElementById('screen-board').appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(moonBurstTimer);
  moonBurstTimer = setTimeout(()=> el.classList.remove('show'), BURST_DURATIONS.moon);
}

let sunBurstTimer = null;
function showSunBurst(){
  let el = document.getElementById('sun-burst');
  if(!el){
    el = document.createElement('div');
    el.id = 'sun-burst';
    el.className = 'moon-burst sun-burst';
    el.innerHTML = `<img src="assets/effects/sun_burst.webp" alt="">`;
    document.getElementById('screen-board').appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(sunBurstTimer);
  sunBurstTimer = setTimeout(()=> el.classList.remove('show'), BURST_DURATIONS.sun);
}

let butterflyBurstTimer = null;
function showButterflyBurst(){
  let el = document.getElementById('butterfly-burst');
  if(!el){
    el = document.createElement('div');
    el.id = 'butterfly-burst';
    el.className = 'moon-burst butterfly-burst';
    el.innerHTML = `<img src="assets/effects/butterfly_burst.webp" alt="">`;
    document.getElementById('screen-board').appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(butterflyBurstTimer);
  butterflyBurstTimer = setTimeout(()=> el.classList.remove('show'), BURST_DURATIONS.butterfly);
}

// 一次连锁里如果同时触发好几种特效(例如月亮+蝴蝶同时连线),排队一个一个播,不要同时叠在一起互相盖掉
function playBurstQueue(list){
  if(!list.length) return;
  const [head, ...rest] = list;
  head.show();
  setTimeout(()=> playBurstQueue(rest), head.duration);
}

let swapBurstTimer = null;
function showSwapBurst(){
  let el = document.getElementById('swap-burst');
  if(!el){
    el = document.createElement('div');
    el.id = 'swap-burst';
    el.className = 'moon-burst swap-burst';
    el.innerHTML = `<img src="assets/effects/element_swap_burst.webp" alt="">`;
    document.getElementById('screen-board').appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(swapBurstTimer);
  swapBurstTimer = setTimeout(()=> el.classList.remove('show'), BURST_DURATIONS.swap);
}

let companionBurstTimer = null;
function showCompanionBurst(){
  let el = document.getElementById('companion-burst');
  if(!el){
    el = document.createElement('div');
    el.id = 'companion-burst';
    el.className = 'moon-burst companion-burst';
    el.innerHTML = `<img src="assets/effects/companion_doll_burst.webp" alt="">`;
    document.getElementById('screen-board').appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(companionBurstTimer);
  companionBurstTimer = setTimeout(()=> el.classList.remove('show'), BURST_DURATIONS.companion);
}

let catchStarBurstTimer = null;
function showCatchStarBurst(){
  let el = document.getElementById('catch-star-burst');
  if(!el){
    el = document.createElement('div');
    el.id = 'catch-star-burst';
    el.className = 'moon-burst catch-star-burst';
    el.innerHTML = `<img src="assets/effects/catch_star_burst.webp" alt="">`;
    document.getElementById('screen-board').appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(catchStarBurstTimer);
  catchStarBurstTimer = setTimeout(()=> el.classList.remove('show'), BURST_DURATIONS.catchStar);
}

let bottleCollectBurstTimer = null;
function showBottleCollectBurst(){
  let el = document.getElementById('bottle-collect-burst');
  if(!el){
    el = document.createElement('div');
    el.id = 'bottle-collect-burst';
    el.className = 'moon-burst bottle-collect-burst';
    el.innerHTML = `<img src="assets/effects/bottle_collect_burst.webp" alt="">`;
    document.getElementById('screen-board').appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(bottleCollectBurstTimer);
  bottleCollectBurstTimer = setTimeout(()=> el.classList.remove('show'), BURST_DURATIONS.bottleCollect);
}

let loveFullBurstTimer = null;
function showLoveFullBurst(){
  let el = document.getElementById('love-full-burst');
  if(!el){
    el = document.createElement('div');
    el.id = 'love-full-burst';
    el.className = 'moon-burst love-full-burst';
    el.innerHTML = `<img src="assets/effects/love_full_burst.webp" alt="">`;
    document.getElementById('screen-board').appendChild(el);
  }
  el.classList.add('show');
  clearTimeout(loveFullBurstTimer);
  loveFullBurstTimer = setTimeout(()=> el.classList.remove('show'), BURST_DURATIONS.loveFull);
}

/* ============================================================
   远派金币技能:只在一般关卡(非无尽挑战)可用,整关内可以重复花钱购买。
   元素互换(1枚):点两个非冰冻格直接互换内容,不占用步数;
   陪伴娃娃(7枚):场上每只兔兔/小派、狗狗/小远,都在旁边多变出一只同类,月亮/蝴蝶/太阳不受影响;
   捕星星(9枚):场上所有星星直接消失;
   玻璃瓶(17枚):点一个非冰冻格取样它的图案,场上所有该图案(非冰冻格)全部消失;
   爱心满满(19枚):场上除了兔兔/小派、狗狗/小远以外的非冰冻格,全部变成爱心
   ============================================================ */
const COIN_SKILL_COST = { swap: 1, companion: 7, catchStar: 9, bottleCollect: 17, loveFull: 19 };
// 技能生效的那一刻,场上先有一拍(350ms)的闪光/消失动画,让玩家看清楚发生了什么,动画播完才叠加大图特效
const SKILL_FLASH_DURATION = 350;

function openCoinSkillsModal(){
  if(!BOARD || BOARD.endless) return;
  showModalQueue([{type:'coin-skills'}], 'screen-board');
}

// 技能实际生效后,先播一拍闪光动画,动画结束才叠加大图特效,特效播完再跑 afterFn(通常是 resolveCascade 或解锁棋盘)
function playFlashThenBurst(flashCells, flashCls, burstFn, burstDuration, afterFn){
  flashCells.forEach(([r,c])=>{
    const el = document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
    if(el) el.classList.add(flashCls);
  });
  setTimeout(()=>{
    burstFn();
    setTimeout(afterFn, burstDuration);
  }, SKILL_FLASH_DURATION);
}

function enterCoinSwapMode(){
  BOARD.coinSwapMode = true;
  BOARD.coinSwapFirst = null;
  selectedCell = null;
  markSelected();
  showBoardToast('元素互换:点两个方块直接互换位置', 2000);
}
function exitCoinSwapMode(){
  if(BOARD && BOARD.coinSwapMode){
    BOARD.coinSwapMode = false;
    BOARD.coinSwapFirst = null;
    document.querySelectorAll('.tile.coin-swap-pick').forEach(el=> el.classList.remove('coin-swap-pick'));
  }
}
// 选格模式下点两个非冰冻格,直接互换内容(不检查相邻/不检查是否形成连线),本身不算一步。
// 互换瞬间先播闪光动画,动画结束才叠加特效图,特效图播完才结算连锁
function handleCoinSwapPick(r,c){
  if(BOARD.cells[r][c].frozen){ flashDeny(r,c); return; }
  if(!BOARD.coinSwapFirst){
    BOARD.coinSwapFirst = {r,c};
    document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`)?.classList.add('coin-swap-pick');
    return;
  }
  const {r:r1,c:c1} = BOARD.coinSwapFirst;
  if(r1===r && c1===c){
    document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`)?.classList.remove('coin-swap-pick');
    BOARD.coinSwapFirst = null;
    return;
  }
  STATE.coins -= COIN_SKILL_COST.swap;
  saveState();
  updateCoinDisplays();
  swapCells(BOARD.cells, r1,c1,r,c);
  exitCoinSwapMode();
  BOARD.busy = true;
  renderBoard();
  playFlashThenBurst([[r1,c1],[r,c]], 'skill-pop', showSwapBurst, BURST_DURATIONS.swap, ()=> resolveCascade(1));
}

// 陪伴娃娃:扫描场上所有兔兔/小派、狗狗/小远,各自在一个相邻的非月亮/蝴蝶/太阳格子里多变出一只同类型(优先保留 XIAOPAI/XIAOYUAN 这种剧情关卡的替身图案)。
// 变出瞬间先播闪光动画,动画结束才叠加特效图,特效图播完才结算连锁
function useCompanionDoll(){
  if(STATE.coins < COIN_SKILL_COST.companion) return;
  const cfg = BOARD.config;
  const claimed = new Set();
  const sources = [];
  for(let r=0;r<cfg.rows;r++) for(let c=0;c<cfg.cols;c++){
    const cell = BOARD.cells[r][c];
    if(!cell) continue;
    if(cell.type===BUNNY_IDX || cell.type===XIAOPAI_IDX || cell.type===DOGFACE_IDX || cell.type===XIAOYUAN_IDX){
      sources.push({r,c,type:cell.type});
    }
  }
  let changed = false;
  const spawnedCells = [];
  sources.forEach(({r,c,type})=>{
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]].sort(()=>Math.random()-0.5);
    for(const [dr,dc] of dirs){
      const nr=r+dr, nc=c+dc;
      const key = nr+','+nc;
      if(!inBounds(nr,nc,cfg) || claimed.has(key)) continue;
      const target = BOARD.cells[nr][nc];
      if(!target || target.frozen) continue;
      if(target.type===MOONFACE_IDX || target.type===BUTTERFLY_IDX || target.type===SUN_IDX) continue;
      BOARD.cells[nr][nc] = { type, frozen:false };
      claimed.add(key);
      spawnedCells.push([nr,nc]);
      changed = true;
      break;
    }
  });
  STATE.coins -= COIN_SKILL_COST.companion;
  saveState();
  updateCoinDisplays();
  BOARD.busy = true;
  renderBoard();
  if(changed){
    playFlashThenBurst(spawnedCells, 'skill-pop', showCompanionBurst, BURST_DURATIONS.companion, ()=> resolveCascade(1));
  } else {
    showCompanionBurst();
    setTimeout(()=>{ BOARD.busy = false; }, BURST_DURATIONS.companion);
  }
}

// 捕星星:场上所有非冰冻的星星先播消失闪光,动画结束才真的消失掉落补位,再叠加特效图,特效图播完才结算连锁
function useCatchStar(){
  if(STATE.coins < COIN_SKILL_COST.catchStar) return;
  const cfg = BOARD.config;
  const targets = [];
  for(let r=0;r<cfg.rows;r++) for(let c=0;c<cfg.cols;c++){
    const cell = BOARD.cells[r][c];
    if(cell && cell.type===STAR_IDX && !cell.frozen) targets.push([r,c]);
  }
  const changed = targets.length>0;
  STATE.coins -= COIN_SKILL_COST.catchStar;
  saveState();
  updateCoinDisplays();
  BOARD.busy = true;
  if(!changed){
    showCatchStarBurst();
    setTimeout(()=>{ BOARD.busy = false; }, BURST_DURATIONS.catchStar);
    return;
  }
  targets.forEach(([r,c])=>{
    const el = document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
    if(el) el.classList.add('clearing');
  });
  setTimeout(()=>{
    targets.forEach(([r,c])=>{ BOARD.cells[r][c] = null; });
    applyGravity(cfg);
    renderBoard();
    showCatchStarBurst();
    setTimeout(()=> resolveCascade(1), BURST_DURATIONS.catchStar);
  }, SKILL_FLASH_DURATION);
}

// 玻璃瓶:进入选格模式,点一个非冰冻格取样它的图案,场上所有该图案(非冰冻格)先播消失闪光,
// 动画结束才真的消失掉落补位,再叠加特效图,特效图播完才结算连锁
function enterBottlePickMode(){
  BOARD.bottlePickMode = true;
  selectedCell = null;
  markSelected();
  showBoardToast('玻璃瓶:点一个方块,收集场上所有同款图案', 2000);
}
function exitBottlePickMode(){
  if(BOARD && BOARD.bottlePickMode) BOARD.bottlePickMode = false;
}
function handleBottlePick(r,c){
  const cell = BOARD.cells[r][c];
  if(cell.frozen){ flashDeny(r,c); return; }
  const targetType = cell.type;
  exitBottlePickMode();
  const cfg = BOARD.config;
  const targets = [];
  for(let rr=0;rr<cfg.rows;rr++) for(let cc=0;cc<cfg.cols;cc++){
    const cc2 = BOARD.cells[rr][cc];
    if(cc2 && cc2.type===targetType && !cc2.frozen) targets.push([rr,cc]);
  }
  STATE.coins -= COIN_SKILL_COST.bottleCollect;
  saveState();
  updateCoinDisplays();
  BOARD.busy = true;
  targets.forEach(([rr,cc])=>{
    const el = document.querySelector(`.tile[data-r="${rr}"][data-c="${cc}"]`);
    if(el) el.classList.add('clearing');
  });
  setTimeout(()=>{
    targets.forEach(([rr,cc])=>{ BOARD.cells[rr][cc] = null; });
    applyGravity(cfg);
    renderBoard();
    showBottleCollectBurst();
    setTimeout(()=> resolveCascade(1), BURST_DURATIONS.bottleCollect);
  }, SKILL_FLASH_DURATION);
}

// 爱心满满:场上除了兔兔/小派、狗狗/小远以外的非冰冻格,全部变成爱心。
// 变化瞬间先播闪光动画,动画结束才叠加特效图,特效图播完才结算连锁
function useLoveFull(){
  if(STATE.coins < COIN_SKILL_COST.loveFull) return;
  const cfg = BOARD.config;
  let changed = false;
  const changedCells = [];
  for(let r=0;r<cfg.rows;r++) for(let c=0;c<cfg.cols;c++){
    const cell = BOARD.cells[r][c];
    if(!cell || cell.frozen) continue;
    if(cell.type===BUNNY_IDX || cell.type===XIAOPAI_IDX || cell.type===DOGFACE_IDX || cell.type===XIAOYUAN_IDX) continue;
    if(cell.type===HEART_IDX) continue;
    cell.type = HEART_IDX;
    changedCells.push([r,c]);
    changed = true;
  }
  STATE.coins -= COIN_SKILL_COST.loveFull;
  saveState();
  updateCoinDisplays();
  BOARD.busy = true;
  renderBoard();
  if(changed){
    playFlashThenBurst(changedCells, 'skill-pop', showLoveFullBurst, BURST_DURATIONS.loveFull, ()=> resolveCascade(1));
  } else {
    showLoveFullBurst();
    setTimeout(()=>{ BOARD.busy = false; }, BURST_DURATIONS.loveFull);
  }
}

/* ============================================================
   月兔捣药:狗狗+兔兔各凑一组就吸引一只月兔,3只月兔合体成一个满月,
   满月可以拖到棋盘上任一格,把该格直接变成月亮图案
   ============================================================ */
function updateRabbitProgress(){
  let gainedRabbit = false;
  while(BOARD.dogfacePending>=1 && BOARD.bunnyPending>=1){
    BOARD.dogfacePending--;
    BOARD.bunnyPending--;
    BOARD.rabbitCount++;
    if(!BOARD.endless) STATE.milestoneStats.rabbitsGained++;
    gainedRabbit = true;
  }
  let gainedMoon = false;
  while(BOARD.rabbitCount>=3){
    BOARD.rabbitCount -= 3;
    BOARD.fullMoonCount++;
    gainedMoon = true;
  }
  if(gainedRabbit || gainedMoon) renderRabbitTray();
  if(gainedRabbit && BOARD.endless) renderEndlessStats();
  if(gainedMoon) showBoardToast('🌝 满月许愿:拖到棋盘上任一格,变出一颗月亮!');
}

function renderRabbitTray(){
  const tray = document.getElementById('rabbit-tray');
  if(!tray || !BOARD) return;
  const rabbitCount = BOARD.rabbitCount||0, fullMoonCount = BOARD.fullMoonCount||0;
  tray.hidden = rabbitCount===0 && fullMoonCount===0;
  let html = '';
  for(let i=0;i<rabbitCount;i++) html += `<img class="rabbit-icon" src="assets/effects/moon_rabbit.png" alt="月兔">`;
  for(let i=0;i<fullMoonCount;i++) html += `<span class="fullmoon-icon" title="拖到棋盘上任一格,变出一颗月亮">🌝</span>`;
  tray.innerHTML = html;
}

let moonDrag = null;
document.getElementById('rabbit-tray').addEventListener('pointerdown', (e)=>{
  if(BOARD.busy) return;
  const el = e.target.closest('.fullmoon-icon');
  if(!el) return;
  e.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'moon-drag-ghost';
  ghost.textContent = '🌝';
  document.body.appendChild(ghost);
  moonDrag = { ghost };
  moveMoonGhost(e.clientX, e.clientY);
  window.addEventListener('pointermove', onMoonDragMove);
  window.addEventListener('pointerup', onMoonDragEnd);
});
function moveMoonGhost(x,y){
  if(!moonDrag) return;
  moonDrag.ghost.style.left = x+'px';
  moonDrag.ghost.style.top = y+'px';
}
function onMoonDragMove(e){ moveMoonGhost(e.clientX, e.clientY); }
function onMoonDragEnd(e){
  window.removeEventListener('pointermove', onMoonDragMove);
  window.removeEventListener('pointerup', onMoonDragEnd);
  if(!moonDrag) return;
  moonDrag.ghost.remove();
  moonDrag = null;
  const dropEl = document.elementFromPoint(e.clientX, e.clientY);
  const tile = dropEl && dropEl.closest('.tile');
  if(!tile) return;
  applyFullMoon(+tile.dataset.r, +tile.dataset.c);
}
function applyFullMoon(r,c){
  if(BOARD.busy || BOARD.fullMoonCount<=0) return;
  const cell = BOARD.cells[r][c];
  if(!cell || cell.frozen){ flashDeny(r,c); return; }
  BOARD.fullMoonCount--;
  // 月兔捣药是「技能」,跟蝴蝶/太阳一样只在实际触发(把满月拖到棋盘上换掉一个非冰冻格)时才计数
  if(BOARD.endless){
    BOARD.stats.moonPoundings++;
    // 放置满月本身不会消除任何格子,原本完全不计分,额外给个技能奖励分,让「最富有的人」称号也能反映这个技能的使用次数
    BOARD.score += 30;
  } else STATE.milestoneStats.moonPoundings++;
  renderRabbitTray();
  if(BOARD.endless) renderEndlessStats();
  BOARD.cells[r][c] = { type: MOONFACE_IDX, frozen:false };
  BOARD.busy = true;
  renderBoard();
  // 「满月许愿成真」这句话展示后再判定连锁,让玩家先看到这句话,跟接下来的月亮合体提示分开一点点
  showBoardToast('🌝 满月许愿成真!', 1400);
  setTimeout(()=> resolveCascade(1), 1000);
}

function swapCells(cells,r1,c1,r2,c2){
  const tmp = cells[r1][c1];
  cells[r1][c1] = cells[r2][c2];
  cells[r2][c2] = tmp;
}

function findMatches(cells, cfg){
  const matched = new Set();
  const runs = [];
  // 横向
  for(let r=0;r<cfg.rows;r++){
    let runStart=0;
    for(let c=1;c<=cfg.cols;c++){
      const prev = cells[r][c-1];
      const cur = c<cfg.cols ? cells[r][c] : null;
      const sameRun = cur && prev && !prev.frozen && !cur.frozen && prev.type===cur.type;
      if(!sameRun){
        const len = c - runStart;
        if(len>=3){
          const coords=[];
          for(let k=runStart;k<c;k++){ matched.add(r+','+k); coords.push([r,k]); }
          runs.push(coords);
        }
        runStart = c;
      }
    }
  }
  // 纵向
  for(let c=0;c<cfg.cols;c++){
    let runStart=0;
    for(let r=1;r<=cfg.rows;r++){
      const prev = cells[r-1][c];
      const cur = r<cfg.rows ? cells[r][c] : null;
      const sameRun = cur && prev && !prev.frozen && !cur.frozen && prev.type===cur.type;
      if(!sameRun){
        const len = r - runStart;
        if(len>=3){
          const coords=[];
          for(let k=runStart;k<r;k++){ matched.add(k+','+c); coords.push([k,c]); }
          runs.push(coords);
        }
        runStart = r;
      }
    }
  }
  return { matched, runs };
}

/* 棋盘尺寸(行列数)在同一关内不会变,所以格子的 DOM 节点只在真正需要时(换关、窗口缩放)才整个重建,
   平常消除连锁只更新「图案或冻结状态真的变了」的格子,避免每次连锁都把81颗格子拆掉重建造成的卡顿闪烁 */
function renderBoard(){
  const grid = document.getElementById('board-grid');
  const cfg = BOARD.config;

  const wrap = grid.getBoundingClientRect();
  const gap = 4;
  const size = Math.max(20, Math.floor(Math.min(
    (wrap.width - gap*(cfg.cols-1)) / cfg.cols,
    (wrap.height - gap*(cfg.rows-1)) / cfg.rows
  )));

  const needsRebuild = !BOARD.tileEls || BOARD.tileEls.length!==cfg.rows || BOARD.tileEls[0].length!==cfg.cols;
  const sizeChanged = BOARD.lastTileSize !== size;

  if(needsRebuild){
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${cfg.cols}, ${size}px)`;
    grid.style.gridTemplateRows = `repeat(${cfg.rows}, ${size}px)`;
    const frag = document.createDocumentFragment();
    BOARD.tileEls = [];
    BOARD.lastRenderTypes = [];
    for(let r=0;r<cfg.rows;r++){
      const row = [], typeRow = [];
      for(let c=0;c<cfg.cols;c++){
        const div = document.createElement('div');
        div.className = 'tile';
        div.style.width = size+'px';
        div.style.height = size+'px';
        div.dataset.r = r;
        div.dataset.c = c;
        const icon = document.createElement('div');
        icon.className = 'tile-icon';
        div.appendChild(icon);
        frag.appendChild(div);
        row.push(div);
        typeRow.push(null);
      }
      BOARD.tileEls.push(row);
      BOARD.lastRenderTypes.push(typeRow);
    }
    grid.appendChild(frag);
    BOARD.lastTileSize = size;
  } else if(sizeChanged){
    grid.style.gridTemplateColumns = `repeat(${cfg.cols}, ${size}px)`;
    grid.style.gridTemplateRows = `repeat(${cfg.rows}, ${size}px)`;
    for(let r=0;r<cfg.rows;r++) for(let c=0;c<cfg.cols;c++){
      BOARD.tileEls[r][c].style.width = size+'px';
      BOARD.tileEls[r][c].style.height = size+'px';
    }
    BOARD.lastTileSize = size;
  }

  for(let r=0;r<cfg.rows;r++){
    for(let c=0;c<cfg.cols;c++){
      const cell = BOARD.cells[r][c];
      const last = BOARD.lastRenderTypes[r][c];
      const div = BOARD.tileEls[r][c];
      // 就算图案/冻结状态没变,只要格子身上还留着消除动画的残留 class(理论上不该发生,但保险起见),也要强制刷新,
      // 不然 .line-burst 动画结束时的 scale(0.25)/opacity:0 终态会让格子看起来「图片消失了」
      const needsCleanup = div.classList.contains('clearing') || div.classList.contains('line-burst');
      if(last && last.type===cell.type && last.frozen===cell.frozen && !needsCleanup) continue;
      div.classList.remove('clearing','line-burst');
      div.classList.toggle('frozen', cell.frozen);
      div.style.background = TILE_TYPES[cell.type].bg;
      div.firstChild.style.backgroundImage = `url(${TILE_TYPES[cell.type].img})`;
      BOARD.lastRenderTypes[r][c] = { type: cell.type, frozen: cell.frozen };
    }
  }
  markSelected();
}

function markSelected(){
  document.querySelectorAll('.tile').forEach(el=>{
    const r=+el.dataset.r, c=+el.dataset.c;
    el.classList.toggle('selected', !!selectedCell && selectedCell.r===r && selectedCell.c===c);
  });
}

// 用事件委派统一挂在棋盘容器上,而不是每次 renderBoard() 都替 81 颗格子各自绑一次监听器,减少重排卡顿
document.getElementById('board-grid').addEventListener('pointerdown', (e)=>{
  if(BOARD.busy) return;
  const tile = e.target.closest('.tile');
  if(!tile) return;
  const r = +tile.dataset.r, c = +tile.dataset.c;
  pointerDrag = { r, c, x:e.clientX, y:e.clientY, dragged:false };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
});

function onPointerMove(e){
  if(!pointerDrag || pointerDrag.dragged || BOARD.busy || BOARD.coinSwapMode || BOARD.bottlePickMode) return;
  const dx = e.clientX - pointerDrag.x;
  const dy = e.clientY - pointerDrag.y;
  const threshold = 18;
  if(Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
  let dr=0, dc=0;
  if(Math.abs(dx) > Math.abs(dy)) dc = dx>0?1:-1; else dr = dy>0?1:-1;
  const nr = pointerDrag.r + dr, nc = pointerDrag.c + dc;
  pointerDrag.dragged = true;
  if(inBounds(nr,nc,BOARD.config)){
    selectedCell = null;
    attemptSwap(pointerDrag.r, pointerDrag.c, nr, nc);
  }
}

function onPointerUp(e){
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  if(!pointerDrag) return;
  const wasDragged = pointerDrag.dragged;
  const {r,c} = pointerDrag;
  pointerDrag = null;
  if(wasDragged || BOARD.busy) return;

  if(BOARD.coinSwapMode){
    handleCoinSwapPick(r,c);
    return;
  }
  if(BOARD.bottlePickMode){
    handleBottlePick(r,c);
    return;
  }

  // 点选逻辑
  if(BOARD.cells[r][c].frozen){
    flashDeny(r,c);
    return;
  }
  if(!selectedCell){
    selectedCell = {r,c};
    markSelected();
    return;
  }
  if(selectedCell.r===r && selectedCell.c===c){
    selectedCell = null;
    markSelected();
    return;
  }
  const dr = Math.abs(selectedCell.r-r), dc = Math.abs(selectedCell.c-c);
  const adjacent = (dr+dc===1);
  if(adjacent){
    const sr=selectedCell.r, sc=selectedCell.c;
    selectedCell = null;
    attemptSwap(sr,sc,r,c);
  } else {
    selectedCell = {r,c};
    markSelected();
  }
}

function flashDeny(r,c){
  const el = document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
  if(el){ el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),300); }
}

function attemptSwap(r1,c1,r2,c2){
  if(BOARD.cells[r1][c1].frozen || BOARD.cells[r2][c2].frozen){
    flashDeny(r1,c1); flashDeny(r2,c2);
    return;
  }
  BOARD.busy = true;
  swapCells(BOARD.cells, r1,c1,r2,c2);
  const {matched} = findMatches(BOARD.cells, BOARD.config);

  if(matched.size===0){
    // 还原
    swapCells(BOARD.cells, r1,c1,r2,c2);
    renderBoard();
    flashDeny(r1,c1); flashDeny(r2,c2);
    BOARD.busy = false;
    return;
  }

  if(BOARD.endless){
    renderEndlessStats();
  } else {
    BOARD.movesLeft--;
    document.getElementById('board-moves-left').textContent = BOARD.movesLeft;
  }
  renderBoard();
  setTimeout(()=> resolveCascade(1), 120);
}

function resolveCascade(combo){
  const cfg = BOARD.config;
  const {matched, runs} = findMatches(BOARD.cells, cfg);
  if(matched.size===0){
    const levelStillActive = BOARD.score < cfg.targetScore && BOARD.movesLeft > 0;
    if(levelStillActive && !hasPossibleMove(BOARD.cells, cfg)){
      reshuffleBoard(cfg);
      renderBoard();
      showBoardToast('没有可交换的组合了,重新排列中…');
      BOARD.busy = false;
      return;
    }
    BOARD.busy = false;
    if(BOARD.endless) saveEndlessProgress();
    checkLevelEnd();
    return;
  }

  // 各种图案的特殊效果
  let bombed = false;
  let sunBursted = false;
  let butterflyBursted = false;
  let bonusMoves = 0;
  let specialMsg = null;
  const burstCells = new Set(); // 月亮/蝴蝶/太阳的爆炸特效格,消除动画会用更炫的燃烧特效取代普通淡出
  runs.forEach(run=>{
    const [rr,rc] = run[0];
    const cell = BOARD.cells[rr][rc];
    if(!cell) return;
    const type = cell.type;
    const isHorizontal = run[0][0]===run[run.length-1][0];

    // 月亮:连成一线时,以该线中点为中心炸开周遭 3x3(冰冻格也一并炸掉)
    if(type===MOONFACE_IDX){
      const [mr,mc] = run[Math.floor(run.length/2)];
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        const nr=mr+dr, nc=mc+dc;
        if(inBounds(nr,nc,cfg) && BOARD.cells[nr][nc] && !matched.has(nr+','+nc)){
          const k = nr+','+nc;
          matched.add(k);
          burstCells.add(k);
          bombed = true;
        }
      }
      if(BOARD.endless){
        BOARD.stats.moonBombs++;
        // 额外给个技能触发奖励分(炸开的格子本身另外还有消除计分),让「最富有的人」称号也能反映这个技能的触发次数
        BOARD.score += 50;
      } else STATE.milestoneStats.moonBombs++;
    }

    // 40关后,蝴蝶4连以上:清空整排(横向连成就清空该行,纵向连成就清空该列),整排炸开特效
    if(type===BUTTERFLY_IDX && cfg.level>=40 && run.length>=4){
      if(isHorizontal){
        for(let c=0;c<cfg.cols;c++) if(BOARD.cells[rr][c]){ const k=rr+','+c; matched.add(k); burstCells.add(k); }
      } else {
        for(let r=0;r<cfg.rows;r++) if(BOARD.cells[r][rc]){ const k=r+','+rc; matched.add(k); burstCells.add(k); }
      }
      specialMsg = `"Let's run away 🏃🏻🦋"`;
      butterflyBursted = true;
      if(BOARD.endless) BOARD.stats.butterflyBursts++;
      else STATE.milestoneStats.butterflyBursts++;
    }

    // 60关后,太阳4连以上:以命中点为中心,清空十字型两排(整行+整列),十字炸开特效
    if(type===SUN_IDX && cfg.level>=60 && run.length>=4){
      const [mr,mc] = run[Math.floor(run.length/2)];
      for(let c=0;c<cfg.cols;c++) if(BOARD.cells[mr][c]){ const k=mr+','+c; matched.add(k); burstCells.add(k); }
      for(let r=0;r<cfg.rows;r++) if(BOARD.cells[r][mc]){ const k=r+','+mc; matched.add(k); burstCells.add(k); }
      specialMsg = `"morning sunshine☀️"`;
      sunBursted = true;
      if(BOARD.endless) BOARD.stats.sunBursts++;
      else STATE.milestoneStats.sunBursts++;
    }

    // 狗狗/小远、兔兔/小派配对成功都是:步数 +1(50关后+2)。原本70关起还有一段+7/+9,
    // 但实测69关目前打法结束时还剩约10步,代表后期步数已经太松了,拿掉那一段,50关后统一+2就好
    if(type===DOGFACE_IDX || type===XIAOYUAN_IDX){
      const add = cfg.level>=50 ? 2 : 1;
      bonusMoves += add;
      specialMsg = `🐶 狗狗组合!步数 +${add}`;
      BOARD.dogfacePending++;
      if(BOARD.endless) BOARD.stats.dogfaceMatches++;
      else STATE.milestoneStats.dogfaceMatches++;
    }
    if(type===BUNNY_IDX || type===XIAOPAI_IDX){
      const add = cfg.level>=50 ? 2 : 1;
      bonusMoves += add;
      specialMsg = `🐰 兔兔组合!步数 +${add}`;
      BOARD.bunnyPending++;
      if(BOARD.endless) BOARD.stats.bunnyMatches++;
      else STATE.milestoneStats.bunnyMatches++;
    }
  });
  updateRabbitProgress();
  if(BOARD.endless) renderEndlessStats();
  else if(bonusMoves>0){
    BOARD.movesLeft += bonusMoves;
    document.getElementById('board-moves-left').textContent = BOARD.movesLeft;
  }
  // 特效图放在消除闪光动画结束后才出现(先让玩家看清楚方块闪光消失,再放大图),文字提示则维持立即显示
  if(bombed){
    showBoardToast('🌙 🐇月兔合體——炸开了阻礙！');
  } else if(sunBursted){
    showBoardToast(specialMsg);
  } else if(butterflyBursted || specialMsg) showBoardToast(specialMsg);

  // 解冻相邻冰冻格
  matched.forEach(key=>{
    const [r,c] = key.split(',').map(Number);
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr,nc])=>{
      if(inBounds(nr,nc,cfg) && BOARD.cells[nr][nc] && BOARD.cells[nr][nc].frozen && !matched.has(nr+','+nc)){
        BOARD.cells[nr][nc].frozen = false;
      }
    });
  });

  // 计分:每格 10 分,4连*1.5倍、5连以上*2倍(爽度加成),额外炸开的格子(月亮3x3/蝴蝶整排/太阳十字)算基础分,最后再乘上连锁倍数
  let gained = 0;
  const runCellKeys = new Set();
  runs.forEach(run=>{
    run.forEach(([r,c])=> runCellKeys.add(r+','+c));
    const lengthMult = run.length>=5 ? 2 : run.length>=4 ? 1.5 : 1;
    gained += run.length * 10 * lengthMult;
  });
  matched.forEach(key=>{ if(!runCellKeys.has(key)) gained += 10; });
  gained = Math.round(gained * combo);
  BOARD.score += gained;
  document.getElementById('board-score-current').textContent = BOARD.score;
  document.getElementById('board-score-fill').style.width =
    Math.min(100, BOARD.score/cfg.targetScore*100)+'%';

  // 播放消除动画:蝴蝶整排/太阳十字的爆炸格用更炫的燃烧特效,其余照旧淡出
  matched.forEach(key=>{
    const [r,c] = key.split(',').map(Number);
    const el = document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
    if(el) el.classList.add(burstCells.has(key) ? 'line-burst' : 'clearing');
  });

  // 有爆炸特效格时,消除动作延后一拍(1秒,跟 lineBurst 动画时长对齐),让玩家先感受到爆炸的震撼感,一般消除维持原本的快节奏
  const clearDelay = burstCells.size>0 ? 1000 : 180;
  setTimeout(()=>{
    matched.forEach(key=>{
      const [r,c] = key.split(',').map(Number);
      BOARD.cells[r][c] = null;
    });
    applyGravity(cfg);
    renderBoard();
    // 闪光消除动画结束的这一刻才放大图特效;延后到下一帧再显示,避开 renderBoard() 这次重排造成的卡顿。
    // 同一次连锁里如果好几种特效一起触发(例如月亮+蝴蝶同时连线),排队一个一个播,不要同时叠在一起互相盖掉
    const burstQueue = [];
    if(bombed) burstQueue.push({ show:showMoonBurst, duration:BURST_DURATIONS.moon });
    if(butterflyBursted) burstQueue.push({ show:showButterflyBurst, duration:BURST_DURATIONS.butterfly });
    if(sunBursted) burstQueue.push({ show:showSunBurst, duration:BURST_DURATIONS.sun });
    if(burstQueue.length) requestAnimationFrame(()=> requestAnimationFrame(()=> playBurstQueue(burstQueue)));
    setTimeout(()=> resolveCascade(combo+1), 180);
  }, clearDelay);
}

function applyGravity(cfg){
  for(let c=0;c<cfg.cols;c++){
    let write = cfg.rows-1;
    for(let r=cfg.rows-1;r>=0;r--){
      if(BOARD.cells[r][c] !== null){
        BOARD.cells[write][c] = BOARD.cells[r][c];
        if(write!==r) BOARD.cells[r][c]=null;
        write--;
      }
    }
    for(let r=write;r>=0;r--){
      BOARD.cells[r][c] = { type: pickType(cfg), frozen:false };
    }
  }
}

function checkLevelEnd(){
  const cfg = BOARD.config;
  if(BOARD.score >= cfg.targetScore){
    onLevelWin(cfg.level);
  } else if(BOARD.movesLeft <= 0){
    onLevelFail(cfg.level);
  }
}

/* ============================================================
   过关 / 失败 / 解锁流程
   ============================================================ */
function onLevelWin(levelNum){
  const firstClear = levelNum === STATE.unlockedLevel;
  if(firstClear){
    STATE.unlockedLevel = levelNum+1;
    STATE.totalCleared = levelNum;
    saveState();
  }

  const queue = [];
  queue.push({type:'win', level:levelNum});

  if(firstClear){
    // 戀愛日記章節(9/19/29...79關)過關時,結算「這段時間」(上一次結算之后到现在)累积的兔兔/狗狗/月兔/满月/蝴蝶/太阳数据,
    // 让玩家有个专门的画面可以截图纪念,结算完就归零重新累计下一章
    if(MILESTONES.includes(levelNum)){
      const snapStats = Object.assign({}, STATE.milestoneStats);
      const rewardFields = ['bunnyMatches','dogfaceMatches','rabbitsGained','butterflyBursts','sunBursts','moonBombs','moonPoundings'];
      const rewards = {};
      let totalCoins = 0;
      rewardFields.forEach(k=>{
        const r = coinRewardForCount(snapStats[k]||0);
        rewards[k] = r;
        totalCoins += r;
      });
      STATE.coins += totalCoins;
      queue.push({type:'milestone-summary', level:levelNum, stats: snapStats, rewards, totalCoins});
      STATE.milestoneHistory[levelNum] = { stats: snapStats, rewards, totalCoins };
      STATE.milestoneStats = emptyMilestoneStats();
      saveState();
    }

    if(MEMENTO_LEVELS.includes(levelNum) && !STATE.mementos.includes(levelNum)){
      STATE.mementos.push(levelNum);
      saveState();
      queue.push({type:'memento', level:levelNum});
    }

    if(COUPLE_PHOTO_LEVELS.includes(levelNum) && !STATE.couplePhotos.includes(levelNum)){
      STATE.couplePhotos.push(levelNum);
      saveState();
      queue.push({type:'memento', level:levelNum, source:'couple'});
    }

    const info = xiaoyuanCycleInfo();
    if(info.isHome){
      // 16 张明信片收满后就不再重复,之后小远回家只单纯是回家,不再附赠明信片
      let postcardIdx = null;
      if(STATE.postcards.length < POSTCARD_ITEMS.length){
        postcardIdx = STATE.postcards.length;
        STATE.postcards.push(postcardIdx);
      }
      saveState();
      queue.push({type:'xiaoyuan', postcardIdx});
      queue.push({type:'slot-machine'});
    }

    if(MILESTONES.includes(levelNum) && !STATE.diaryUnlocked.includes(levelNum)){
      STATE.diaryUnlocked.push(levelNum);
      saveState();
      queue.push({type:'diary', level:levelNum});
      if(levelNum === TOTAL_LEVELS) queue.push({type:'ending'});
    }
  }
  showModalQueue(queue);
}

function onLevelFail(levelNum){
  loseLife();
  showModalQueue([{type:'fail', level:levelNum}]);
}

/* ---------------- Modal 伫列 ---------------- */
let modalQueue = [];
let modalReturnScreen = 'screen-map';
function showModalQueue(queue, returnTo){
  modalQueue = queue.slice();
  modalReturnScreen = returnTo || 'screen-map';
  showNextModal();
}
function showNextModal(){
  if(modalQueue.length===0){
    document.getElementById('modal-overlay').hidden = true;
    showScreen(modalReturnScreen);
    return;
  }
  const step = modalQueue.shift();
  renderModal(step);
}

function renderModal(step){
  const overlay = document.getElementById('modal-overlay');
  const card = document.getElementById('modal-card');
  overlay.hidden = false;
  card.classList.toggle('diary-mode', step.type==='diary');
  card.classList.toggle('memento-mode', step.type==='memento' && step.source!=='couple');
  card.classList.toggle('couple-mode', step.type==='memento' && step.source==='couple');
  card.classList.toggle('milestone-mode', step.type==='milestone-summary');

  if(step.type==='about'){
    card.innerHTML = `
      <div class="about-tabs">
        <button class="about-tab-btn active" id="about-tab-play">游戏玩法</button>
        <button class="about-tab-btn" id="about-tab-credits">主创团队</button>
      </div>
      <div class="about-panel active" id="about-panel-play">
        <div class="tutorial-list">
          <div class="tutorial-row"><span class="tutorial-icon">📖</span><div>${HOME_TOUR_STEPS[0].text}</div></div>
          <div class="tutorial-row"><span class="tutorial-icon">🎁</span><div>${HOME_TOUR_STEPS[1].text}</div></div>
          <div class="tutorial-row"><span class="tutorial-icon">💌</span><div>${HOME_TOUR_STEPS[2].text}</div></div>
          <div class="tutorial-row"><span class="tutorial-icon">💰</span><div>${HOME_TOUR_STEPS[3].text}</div></div>
        </div>
      </div>
      <div class="about-panel" id="about-panel-credits">
        <div class="about-credits-title">HHYY【谁是卧底】</div>
        <div class="about-credits-row"><b>主美：</b>英招招</div>
        <div class="about-credits-row"><b>主架：</b>易烊珺</div>
        <div class="about-credits-row"><b>美术：</b>叭叭叭、硬梆梆</div>
        <div class="about-credits-row"><b>文字：</b>不吃生姜、无敌小可</div>
        <div class="about-credits-row"><b>特别感谢：</b>南十字星老师、D老师</div>
      </div>
      <button class="modal-btn" id="modal-next" style="margin-top:14px;">关闭</button>`;
    const playTab = card.querySelector('#about-tab-play');
    const creditsTab = card.querySelector('#about-tab-credits');
    const playPanel = card.querySelector('#about-panel-play');
    const creditsPanel = card.querySelector('#about-panel-credits');
    playTab.addEventListener('click', ()=>{
      playTab.classList.add('active'); creditsTab.classList.remove('active');
      playPanel.classList.add('active'); creditsPanel.classList.remove('active');
    });
    creditsTab.addEventListener('click', ()=>{
      creditsTab.classList.add('active'); playTab.classList.remove('active');
      creditsPanel.classList.add('active'); playPanel.classList.remove('active');
    });
  } else if(step.type==='skills'){
    card.innerHTML = `
      <h3 style="text-align:center;">特殊技能说明</h3>
      <div class="tutorial-list" style="max-height:56vh;overflow-y:auto;">
        <div class="tutorial-row"><span class="tutorial-icon">🐶</span><div><b>狗狗/小远</b>:配对成功加步数(50关前+1,50关后+2)。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">🐰</span><div><b>兔兔/小派</b>:配对成功加步数(50关前+1,50关后+2)。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">🌙</span><div><b>月亮炸弹</b>:连成3个以上,以中心炸开周围3x3区域(冰冻格也一并解除)。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">🦋</span><div><b>私奔蝴蝶</b>(40关起):4连以上,清空整排或整列。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">☀️</span><div><b>早安太阳</b>(60关起):4连以上,以中心十字型清空一整排+一整列。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">🐇</span><div><b>月兔捣药</b>:凑齐一组狗狗+一组兔兔就吸引一只月兔,三只一起捣药捣出一轮满月🌝。可拖到棋盘任一非冰冻格,直接变出一颗月亮(不消耗步数)。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">✨</span><div><b>连击加成</b>:4连消除得分*1.5倍,5连以上*2倍。</div></div>
      </div>
      <button class="modal-btn" id="modal-next" style="margin-top:14px;">关闭</button>`;
  } else if(step.type==='coin-skills'){
    const canSwap = STATE.coins >= COIN_SKILL_COST.swap;
    const canCompanion = STATE.coins >= COIN_SKILL_COST.companion;
    const canCatchStar = STATE.coins >= COIN_SKILL_COST.catchStar;
    const canBottle = STATE.coins >= COIN_SKILL_COST.bottleCollect;
    const canLoveFull = STATE.coins >= COIN_SKILL_COST.loveFull;
    card.innerHTML = `
      <h3 style="text-align:center;">远派金币技能</h3>
      <p style="text-align:center;">目前持有 <img src="assets/ui/coin.webp" alt="" style="width:16px;height:16px;vertical-align:-3px;"> <b>${STATE.coins}</b> 枚</p>
      <div class="coin-skill-row ${canSwap?'':'coin-skill-disabled'}" id="coin-skill-swap">
        <div class="coin-skill-name">🔀 元素互换<span class="coin-skill-cost">${COIN_SKILL_COST.swap}枚</span></div>
        <div class="coin-skill-desc">选两个非冰冻格,直接互换内容,不占用步数</div>
      </div>
      <div class="coin-skill-row ${canCompanion?'':'coin-skill-disabled'}" id="coin-skill-companion">
        <div class="coin-skill-name">🧸 陪伴娃娃<span class="coin-skill-cost">${COIN_SKILL_COST.companion}枚</span></div>
        <div class="coin-skill-desc">场上每只兔兔/狗狗旁边都多变出一只同类</div>
      </div>
      <div class="coin-skill-row ${canCatchStar?'':'coin-skill-disabled'}" id="coin-skill-catchstar">
        <div class="coin-skill-name">⭐ 捕星星<span class="coin-skill-cost">${COIN_SKILL_COST.catchStar}枚</span></div>
        <div class="coin-skill-desc">场上所有星星直接消失</div>
      </div>
      <div class="coin-skill-row ${canBottle?'':'coin-skill-disabled'}" id="coin-skill-bottle">
        <div class="coin-skill-name">🍯 玻璃瓶<span class="coin-skill-cost">${COIN_SKILL_COST.bottleCollect}枚</span></div>
        <div class="coin-skill-desc">选一个非冰冻格取样,收集场上所有同款图案</div>
      </div>
      <div class="coin-skill-row ${canLoveFull?'':'coin-skill-disabled'}" id="coin-skill-lovefull">
        <div class="coin-skill-name">💕 爱心满满<span class="coin-skill-cost">${COIN_SKILL_COST.loveFull}枚</span></div>
        <div class="coin-skill-desc">除了兔兔/狗狗外,场上全部变成爱心</div>
      </div>
      <button class="modal-btn secondary" id="modal-next" style="margin-top:10px;">取消</button>`;
    if(canSwap){
      card.querySelector('#coin-skill-swap').addEventListener('click', ()=>{
        showNextModal();
        enterCoinSwapMode();
      });
    }
    if(canCompanion){
      card.querySelector('#coin-skill-companion').addEventListener('click', ()=>{
        showNextModal();
        useCompanionDoll();
      });
    }
    if(canCatchStar){
      card.querySelector('#coin-skill-catchstar').addEventListener('click', ()=>{
        showNextModal();
        useCatchStar();
      });
    }
    if(canBottle){
      card.querySelector('#coin-skill-bottle').addEventListener('click', ()=>{
        showNextModal();
        enterBottlePickMode();
      });
    }
    if(canLoveFull){
      card.querySelector('#coin-skill-lovefull').addEventListener('click', ()=>{
        showNextModal();
        useLoveFull();
      });
    }
  } else if(step.type==='endless-submit'){
    card.innerHTML = `
      <h3 style="text-align:center;">上传成绩</h3>
      <p>用一个名字记录你的月兔总数,同名会直接覆盖成最新纪录。</p>
      <input type="text" class="name-input" id="endless-name-input" maxlength="16" placeholder="输入你的名字" value="${escapeHtml(STATE.playerName||'')}">
      <div id="endless-submit-status" style="min-height:18px;font-size:12px;color:var(--ink-soft);text-align:center;"></div>
      <button class="modal-btn" id="endless-submit-confirm">送出</button>
      <button class="modal-btn secondary" id="modal-next">取消</button>`;
    card.querySelector('#endless-submit-confirm').addEventListener('click', async ()=>{
      const input = card.querySelector('#endless-name-input');
      const statusEl = card.querySelector('#endless-submit-status');
      const name = input.value.trim();
      if(!name){ statusEl.textContent = '请先输入名字'; return; }
      statusEl.textContent = '上传中…';
      try{
        const entries = await submitLeaderboardScore(name);
        STATE.playerName = name;
        saveState();
        statusEl.textContent = '';
        showModalQueue([{type:'leaderboard', entries}], modalReturnScreen);
      }catch(e){
        statusEl.textContent = '上传失败,请稍后再试';
      }
    });
  } else if(step.type==='leaderboard'){
    card.innerHTML = `
      <h3 style="text-align:center;">🐇 月兔排行榜</h3>
      <div class="title-list" id="title-list"></div>
      <div class="leaderboard-list" id="leaderboard-list">载入中…</div>
      <button class="modal-btn" id="modal-next">关闭</button>`;
    if(step.entries){
      renderLeaderboardList(step.entries);
    } else {
      fetchLeaderboard().then(renderLeaderboardList).catch(()=>{
        const el = card.querySelector('#leaderboard-list');
        if(el) el.innerHTML = `<p style="text-align:center;color:var(--ink-soft);">排行榜暂时连不上,稍后再试。</p>`;
      });
    }
  } else if(step.type==='tutorial-level'){
    card.innerHTML = `
      <div class="modal-emoji">🧩</div>
      <h3>消除玩法</h3>
      <div class="tutorial-list">
        <div class="tutorial-row"><span class="tutorial-icon">1️⃣</span><div>拖曳交换相邻的两个图案。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">2️⃣</span><div>凑满3个以上相同图案就会消除。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">3️⃣</span><div>步数用完前要达到目标分数才算过关。</div></div>
      </div>
      <button class="modal-btn" id="modal-next">开始挑战</button>`;
  } else if(step.type==='backup'){
    const code = encodeSaveCode(STATE);
    card.innerHTML = `
      <h3>存档备份</h3>
      <p style="font-size:12px;">iOS Safari 有时会在久未开启后清掉网页存档,建议偶尔把下面这串代码复制存起来(备忘录/微信文件传输助手都可以),之后可以贴回来还原进度。</p>
      <textarea id="backup-export" class="backup-textarea" readonly></textarea>
      <button class="modal-btn secondary" id="backup-copy" style="margin-top:6px;">复制代码</button>
      <div style="height:14px;"></div>
      <p style="font-size:12px;">还原存档:把之前复制的代码贴到下面,再按还原。</p>
      <textarea id="backup-import" class="backup-textarea" placeholder="贴上存档代码…"></textarea>
      <button class="modal-btn secondary" id="backup-restore" style="margin-top:6px;">还原这组存档</button>
      <div style="height:6px;"></div>
      <button class="modal-btn" id="modal-next">关闭</button>`;
    card.querySelector('#backup-export').value = code;
    card.querySelector('#backup-copy').addEventListener('click', ()=>{
      const ta = card.querySelector('#backup-export');
      ta.select();
      ta.setSelectionRange(0, 99999);
      let ok = false;
      try{ ok = document.execCommand('copy'); }catch(e){}
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(code).catch(()=>{});
      }
      alert(ok ? '已复制,贴到备忘录保存吧。' : '已选取代码,请手动复制(长按 → 复制)。');
    });
    card.querySelector('#backup-restore').addEventListener('click', ()=>{
      const raw = card.querySelector('#backup-import').value.trim();
      if(!raw){ alert('请先贴上存档代码。'); return; }
      const decoded = decodeSaveCode(raw);
      if(!decoded){ alert('这组代码看起来不对,请确认有完整复制。'); return; }
      if(!confirm('确定要用这组代码覆盖目前的进度吗?')) return;
      STATE = Object.assign({}, loadState(), decoded);
      saveState();
      refreshHome();
      overlay.hidden = true;
    });
  } else if(step.type==='nolives'){
    regenLives();
    const remainMs = Math.max(0, (STATE.nextRegenAt||Date.now()) - Date.now());
    const mm = Math.floor(remainMs/60000), ss = Math.floor((remainMs%60000)/1000);
    card.innerHTML = `
      <div class="modal-emoji">💔</div>
      <h3>体力不足</h3>
      <p>爱心用完了,还要等 ${mm}分${String(ss).padStart(2,'0')}秒 才会恢复一颗。\n先回房间陪小派逛逛吧。</p>
      <button class="modal-btn" id="modal-next">好</button>`;
  } else if(step.type==='win'){
    card.innerHTML = `
      <div class="modal-emoji">🎉</div>
      <h3>第 ${step.level} 关过关!</h3>
      <p>目标分数达成,太棒了。</p>
      <button class="modal-btn" id="modal-next">继续</button>`;
  } else if(step.type==='milestone-summary'){
    const s = step.stats;
    const r = step.rewards || {};
    const badge = (key)=> r[key] ? `<span class="milestone-reward">+${r[key]}💰</span>` : '';
    card.innerHTML = `
      <div class="milestone-card">
        <div class="milestone-card-inner">
          <h3>远派恋爱金币结算</h3>
          <div class="tutorial-list" style="margin:6px 0;">
            <div class="tutorial-row"><span class="tutorial-icon">🐰</span><div>兔兔组合 <b>${s.bunnyMatches}</b> 次${badge('bunnyMatches')}</div></div>
            <div class="tutorial-row"><span class="tutorial-icon">🐶</span><div>狗狗组合 <b>${s.dogfaceMatches}</b> 次${badge('dogfaceMatches')}</div></div>
            <div class="tutorial-row"><span class="tutorial-icon">🐇</span><div>引出月兔 <b>${s.rabbitsGained}</b> 只${badge('rabbitsGained')}</div></div>
            <div class="tutorial-row"><span class="tutorial-icon">🦋</span><div>私奔蝴蝶 <b>${s.butterflyBursts}</b> 次${badge('butterflyBursts')}</div></div>
            <div class="tutorial-row"><span class="tutorial-icon">☀️</span><div>早安太阳 <b>${s.sunBursts}</b> 次${badge('sunBursts')}</div></div>
            <div class="tutorial-row"><span class="tutorial-icon">🌕</span><div>月亮合体 <b>${s.moonBombs}</b> 次${badge('moonBombs')}</div></div>
            <div class="tutorial-row"><span class="tutorial-icon">🌝</span><div>月兔捣药 <b>${s.moonPoundings}</b> 次${badge('moonPoundings')}</div></div>
          </div>
          ${step.totalCoins>0 ? `<p class="milestone-total-coins"><img src="assets/ui/coin.webp" alt=""> 本章共获得 ${step.totalCoins} 枚远派金币</p>` : ''}
        </div>
        <div class="milestone-biga-anim"><img src="assets/ui/xiaobiga_anim.gif" alt=""></div>
      </div>
      <button class="modal-btn" id="modal-next" style="margin-top:14px;">${step.reread ? '关闭' : '继续'}</button>`;
    layoutCardBg('.milestone-card', 'milestone-mode');
  } else if(step.type==='fail'){
    card.innerHTML = `
      <div class="modal-emoji">😿</div>
      <h3>步数用完了</h3>
      <p>差一点点,再试一次吧!</p>
      <button class="modal-btn" id="modal-retry">重试本关</button>
      <button class="modal-btn secondary" id="modal-quit">返回地图</button>`;
    card.querySelector('#modal-retry').addEventListener('click', ()=>{
      overlay.hidden = true;
      openBoard(step.level);
    });
    card.querySelector('#modal-quit').addEventListener('click', ()=>{
      overlay.hidden = true;
      showScreen('screen-map');
    });
    return;
  } else if(step.type==='xiaoyuan'){
    const postcard = step.postcardIdx!==null ? POSTCARD_ITEMS[step.postcardIdx] : null;
    const bodyLine = postcard ? `他带回一张明信片:${postcard}` : '这次没带新的明信片,但他带回了满满的拥抱。';
    card.innerHTML = `
      <div class="modal-emoji">🏠</div>
      <h3>小远回家了</h3>
      <p>${bodyLine}</p>
      <button class="modal-btn" id="modal-next">好期待</button>`;
  } else if(step.type==='slot-machine'){
    // 从13种图案里随机抽7张当这次的转轮候选池,三个转轮各自独立从这7张里抽一张:
    // 三个一样(机率1/49)给97枚远派金币大奖,没中给9枚安慰奖
    const pool = TILE_TYPES.map((_,i)=>i).sort(()=>Math.random()-0.5).slice(0,7);
    const results = [0,1,2].map(()=> pool[Math.floor(Math.random()*pool.length)]);
    const jackpot = results[0]===results[1] && results[1]===results[2];
    card.innerHTML = `
      <div class="modal-emoji">🎰</div>
      <h3>小远带回一台迷你拉霸机</h3>
      <p style="text-align:center;">三个转轮拉出同一个图案,就送你远派金币!</p>
      <div class="slot-reels">
        <div class="slot-reel" id="slot-reel-0"><img src="${TILE_TYPES[pool[0]].img}" alt=""></div>
        <div class="slot-reel" id="slot-reel-1"><img src="${TILE_TYPES[pool[1]].img}" alt=""></div>
        <div class="slot-reel" id="slot-reel-2"><img src="${TILE_TYPES[pool[2]].img}" alt=""></div>
      </div>
      <p id="slot-result" class="slot-result" hidden></p>
      <button class="modal-btn" id="slot-pull-btn">拉一下!</button>
      <button class="modal-btn" id="modal-next" style="margin-top:10px;" hidden>继续</button>`;
    const reelEls = [0,1,2].map(i=> card.querySelector(`#slot-reel-${i}`));
    const pullBtn = card.querySelector('#slot-pull-btn');
    const nextBtnEl = card.querySelector('#modal-next');
    const resultEl = card.querySelector('#slot-result');
    pullBtn.addEventListener('click', ()=>{
      pullBtn.disabled = true;
      const spinTimers = [];
      const stopDelays = [800, 1100, 1400];
      reelEls.forEach((el,i)=>{
        const img = el.querySelector('img');
        spinTimers[i] = setInterval(()=>{
          const randIdx = pool[Math.floor(Math.random()*pool.length)];
          img.src = TILE_TYPES[randIdx].img;
        }, 80);
        setTimeout(()=>{
          clearInterval(spinTimers[i]);
          img.src = TILE_TYPES[results[i]].img;
          el.classList.add('slot-reel-stop');
          if(i===2){
            const amount = jackpot ? 97 : 9;
            STATE.coins += amount;
            saveState();
            updateCoinDisplays();
            resultEl.textContent = jackpot ? `🎉 三个一样!+${amount} 枚远派金币!!` : `没中,安慰奖 +${amount} 枚远派金币`;
            resultEl.hidden = false;
            pullBtn.hidden = true;
            nextBtnEl.hidden = false;
          }
        }, stopDelays[i]);
      });
    });
  } else if(step.type==='memento'){
    const isCouple = step.source==='couple';
    const m = isCouple ? COUPLE_PHOTO_ITEMS[step.level] : MEMENTO_ITEMS[step.level];
    const combinedText = m.story || '';
    const headingPrefix = step.reread ? '' : (isCouple ? '获得合照 · ' : '获得纪念品 · ');
    const albumBtnText = isCouple ? '去明信片册看看' : '去纪念品册看看';
    if(isCouple){
      const photoInner = m.img ? `<img src="${m.img}" alt="">` : `<div class="couple-photo-fallback"><span>💌</span></div>`;
      card.innerHTML = `
        <div class="couple-photo-frame">${photoInner}</div>
        <div class="couple-photo-inner">
          <h3>${headingPrefix}${m.name}</h3>
          <p class="couple-photo-story">${combinedText}</p>
        </div>
        <button class="modal-btn diary-close-btn" id="modal-next">${step.reread ? '关闭' : '继续游玩'}</button>
        ${step.reread ? '' : `<button class="modal-btn secondary diary-close-btn" id="modal-goto-album">${albumBtnText}</button>`}`;
    } else {
      const photoInner = m.img ? `<img src="${m.img}" alt="">` : `<div class="memento-photo-fallback">💝</div>`;
      card.innerHTML = `
        <div class="memento-card">
          <div class="memento-photo-circle">${photoInner}</div>
          <div class="memento-card-inner" id="diary-inner">
            <h3>${headingPrefix}${m.name}</h3>
            <div class="diary-page-text" id="diary-page-text"></div>
            <div class="diary-page-nav" id="diary-page-nav" hidden>
              <button class="diary-page-arrow" id="diary-prev" title="上一页">‹</button>
              <div class="diary-page-dots" id="diary-dots"></div>
              <button class="diary-page-arrow" id="diary-next" title="下一页">›</button>
            </div>
          </div>
        </div>
        <button class="modal-btn diary-close-btn" id="modal-next">${step.reread ? '关闭' : '继续游玩'}</button>
        ${step.reread ? '' : `<button class="modal-btn secondary diary-close-btn" id="modal-goto-album">${albumBtnText}</button>`}`;
      layoutCardBg('.memento-card', 'memento-mode');
      setupDiaryPagination(combinedText);
    }
  } else if(step.type==='diary'){
    const d = DIARY_TEXT[step.level];
    card.innerHTML = `
      <div class="diary-card">
        <div class="diary-card-inner" id="diary-inner">
          <h3>${d.title}</h3>
          <div class="diary-page-text" id="diary-page-text"></div>
          <div class="diary-page-nav" id="diary-page-nav" hidden>
            <button class="diary-page-arrow" id="diary-prev" title="上一页">‹</button>
            <div class="diary-page-dots" id="diary-dots"></div>
            <button class="diary-page-arrow" id="diary-next" title="下一页">›</button>
          </div>
        </div>
      </div>
      <button class="modal-btn diary-close-btn" id="modal-next">${step.reread ? '关闭' : '收下这篇日记'}</button>`;
    layoutCardBg('.diary-card', 'diary-mode');
    setupDiaryPagination(d.text);
  } else if(step.type==='ending'){
    card.innerHTML = `
      <div class="ending-illustration"><img src="assets/story/ending.jpg" alt=""></div>
      <h3>只有你和我</h3>
      <p>后来的故事,是他们自己的了。</p>
      <button class="modal-btn" id="modal-next">${step.reread ? '关闭' : '完结'}</button>`;
  }

  const nextBtn = card.querySelector('#modal-next');
  if(nextBtn) nextBtn.addEventListener('click', showNextModal);
  const gotoAlbumBtn = card.querySelector('#modal-goto-album');
  if(gotoAlbumBtn) gotoAlbumBtn.addEventListener('click', ()=>{
    // 注意:不清空 modalQueue——后面如果还排着「小远回家了」/拉霸机等弹窗,
    // 要等玩家从纪念品册/明信片册按返回回到首页时接着播,不能直接消失
    document.getElementById('modal-overlay').hidden = true;
    showScreen('screen-home');
    openAlbum(step.source==='couple' ? 'postcard' : 'memento');
  });
}

/* 戀愛日記卡片跟紀念品卡片共用同一张模板画布尺寸(整张画布+透明背景),裁切逻辑与首页 layoutHomeCanvas() 相同原理 */
function layoutCardBg(cardSelector, modeClass){
  const card = document.querySelector(cardSelector);
  const cardModal = document.querySelector('.modal-card.'+modeClass);
  if(!card || !cardModal) return;

  // 卡片寬度同時要考慮「螢幕寬度」跟「螢幕高度扣掉按鈕後還能撐多高」兩個限制,
  // 取較小值,確保矮螢幕手機上按鈕永遠不會被頂出畫面外。
  const overlay = document.getElementById('modal-overlay');
  const availW = overlay.clientWidth - 24;
  const availH = overlay.clientHeight - 24 - 56; // 扣掉外距與下方關閉按鈕的空間
  const aspect = 815/1198; // width/height
  let width = Math.min(availW, 440, availH*aspect);
  width = Math.max(width, 220);
  cardModal.style.width = width+'px';
  card.style.width = width+'px';

  const rect = card.getBoundingClientRect();
  if(rect.width===0) return;
  const bboxW = DIARY_BG_BBOX.x2 - DIARY_BG_BBOX.x1;
  const scale = rect.width / bboxW; // aspect-ratio 已锁定,所以 rect.height/bboxH 会得到同一个 scale
  card.style.backgroundSize = `${CANVAS_W*scale}px ${CANVAS_H*scale}px`;
  card.style.backgroundPosition = `${-DIARY_BG_BBOX.x1*scale}px ${-DIARY_BG_BBOX.y1*scale}px`;
}
window.addEventListener('resize', ()=>{
  if(document.getElementById('modal-overlay').hidden) return;
  if(document.querySelector('.diary-card')) layoutCardBg('.diary-card', 'diary-mode');
  if(document.querySelector('.memento-card')) layoutCardBg('.memento-card', 'memento-mode');
  if(document.querySelector('.milestone-card')) layoutCardBg('.milestone-card', 'milestone-mode');
});

/* ============================================================
   戀愛日記分頁:文字太長時自動拆頁,而不是塞在小框裡硬捲動
   ============================================================ */
let diaryPageState = { pages:[''], current:0 };

function computeDiaryPages(text, textEl, availHeight){
  const paragraphs = text.split('\n\n');
  const pages = [];
  let current = [];

  function fits(str){
    textEl.textContent = str;
    return textEl.scrollHeight <= availHeight;
  }
  function flushCurrent(){
    if(current.length>0){ pages.push(current.join('\n\n')); current=[]; }
  }

  function addParagraph(para){
    const attempt = current.length ? current.join('\n\n')+'\n\n'+para : para;
    if(fits(attempt)){ current.push(para); return; }
    flushCurrent();
    if(fits(para)){ current=[para]; return; }
    // 連單一段落自己都放不下這一頁,逐行拆
    const lines = para.split('\n');
    let buf = [];
    for(const line of lines){
      const attemptLine = buf.length ? buf.join('\n')+'\n'+line : line;
      if(fits(attemptLine)){ buf.push(line); }
      else{
        if(buf.length>0) pages.push(buf.join('\n'));
        buf = [line];
      }
    }
    if(buf.length>0) current = [buf.join('\n')];
  }

  paragraphs.forEach(addParagraph);
  flushCurrent();
  if(pages.length===0) pages.push('');
  return pages;
}

function setupDiaryPagination(text){
  const inner = document.getElementById('diary-inner');
  const titleEl = inner.querySelector('h3');
  const textEl = document.getElementById('diary-page-text');
  if(!inner || !textEl) return;

  const availHeight = Math.max(60, inner.clientHeight - titleEl.offsetHeight - 8 - 34);
  diaryPageState = { pages: computeDiaryPages(text, textEl, availHeight), current: 0 };
  renderDiaryPage();

  document.getElementById('diary-prev').addEventListener('click', (e)=>{ e.stopPropagation(); goDiaryPage(-1); });
  document.getElementById('diary-next').addEventListener('click', (e)=>{ e.stopPropagation(); goDiaryPage(1); });
  bindDiarySwipe(textEl);
}

function renderDiaryPage(){
  const { pages, current } = diaryPageState;
  const textEl = document.getElementById('diary-page-text');
  const navEl = document.getElementById('diary-page-nav');
  if(!textEl) return;
  textEl.textContent = pages[current];
  if(pages.length<=1){
    navEl.hidden = true;
  } else {
    navEl.hidden = false;
    document.getElementById('diary-prev').disabled = current===0;
    document.getElementById('diary-next').disabled = current===pages.length-1;
    document.getElementById('diary-dots').innerHTML =
      pages.map((_,i)=>`<span class="${i===current?'on':''}"></span>`).join('');
  }
}

function goDiaryPage(delta){
  const next = diaryPageState.current + delta;
  if(next<0 || next>=diaryPageState.pages.length) return;
  diaryPageState.current = next;
  renderDiaryPage();
}

function bindDiarySwipe(el){
  let start = null;
  el.addEventListener('pointerdown', e=>{ start = {x:e.clientX, y:e.clientY}; });
  el.addEventListener('pointerup', e=>{
    if(!start) return;
    const dx = e.clientX-start.x, dy = e.clientY-start.y;
    start = null;
    if(Math.abs(dy)>30 && Math.abs(dy)>Math.abs(dx)){
      goDiaryPage(dy<0 ? 1 : -1); // 往上滑=下一页,往下滑=上一页
    }
  });
}

/* ============================================================
   初始化
   ============================================================ */
showScreen('screen-home');

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
