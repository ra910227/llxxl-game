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
};
// 恋爱日记卡片背景图同样是「整张画布 2048x3200 + 透明背景」,实际图案只占中间一小块
const DIARY_BG_BBOX = {x1:616, y1:1001, x2:1431, y2:2199};

/* ---------------- 消除图案(六种,配色取自房间美术的粉/杏/紫/绿/卡其/蓝) ---------------- */
const TILE_TYPES = [
  { name:'butterfly', bg:'#e3f2fb', img:'assets/tiles/butterfly.png' },
  { name:'star',      bg:'#fde9c8', img:'assets/tiles/star.png' },
  { name:'bunny',     bg:'#fbe3ef', img:'assets/tiles/bunny.png' },
  { name:'dogface',   bg:'#eef2e0', img:'assets/tiles/dogface.png' },
  { name:'moonface',  bg:'#ece6f7', img:'assets/tiles/moonface.png' },
  { name:'movie',     bg:'#e8e8ef', img:'assets/tiles/movie.png' },
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
const SUN_IDX = TILE_TYPES.findIndex(t=>t.name==='sun'); // 60关后:配对成功清空十字型两排

/* ---------------- 收藏册占位内容 ---------------- */
const POSTCARD_ITEMS = [
  '🏙️ 天津出差','🍺 青岛出差','🌆 广州出差','🌶️ 重庆出差','🎡 长沙出差',
  '🏝️ 厦门出差','🌃 深圳出差','🎆 上海出差','🍁 南京出差','🐼 成都出差',
  '🌸 杭州出差','⛰️ 贵州出差','🌴 海南出差'
];
// 跟恋爱日记撞关的几个(原本 10/20/30/40/50/60/70)刻意往前错开几关,
// 避免「获得纪念品」跟「戀愛日記」两个弹窗同一整数关卡一次全部跳出来。
const MEMENTO_LEVELS = [0, 5, 7, 15, 17, 21, 25, 27, 31, 35, 37, 45, 47, 55, 57, 65, 67, 75];

const MEMENTO_ITEMS = {
  0:{name:`家的钥匙`, location:``, img:`assets/gifts/0.png`, story:`「希望哥哥有空可以来找我玩！」
男团解散后，全团11个人，小派新房子的钥匙只送给了小远。没收到钥匙的其他人起哄着，小派笑弯了眼，小远也害羞地收下了。`},
  5:{name:`故宫小香囊`, location:`书包上的`, img:`assets/gifts/5.png`, story:`小派上学时，同学会问书包上的香囊是去哪里买的，小派总是笑着说是哥哥送的。
这是他们第一次一起去故宫玩，一起站在中轴线，一起共享整个世界的纪念。那天的远哥笑得很美，小派永远忘不了。`},
  7:{name:`蝴蝶结卫衣`, location:`床上的`, img:`assets/gifts/7.png`, story:`这是件特别有纪念意义的衣服。男团期间，正常来说小远的衣服不喜欢被乱弄，在小派的不屈不挠及小远的放任下，小派在彩排时在卫衣的领口处绑了一个非常适合小远的蝴蝶结，甚至在活动结束后也不允许小远拆掉。
这次小远来找他时，把这件衣服留在家里了，小派想小远的时候会偷穿，但更多的时候他把它摆在枕头的另一边，就像他的远哥一直陪在他身边一样。`},
  15:{name:`宜家粉绿色情侣对杯`, location:`厨房台面的`, img:`assets/gifts/15.png`, story:`厨房的杯架放着两只粉色、绿色马克杯。粉色马克杯，是为了特别的人准备的，而另一只「最好看的绿色马克杯」通常都在小派手上或书桌上，装着好喝的咖啡。`},
  17:{name:`绿色围巾`, location:`立式衣架上的`, img:`assets/gifts/17.jpg`, story:`派派暗搓搓晒着爱意，本来说最爱黑白色性冷淡风的他不知道从何时开始喜欢了绿色，甚至变成他口中「最伟大的颜色」。`},
  21:{name:`远的麦克风`, location:``, img:`assets/gifts/21.png`, story:``},
  25:{name:`狗狗玩偶`, location:`床头的`, img:`assets/gifts/25.png`, story:`一大早小派按下最后一个闹钟，锤打了床头玩偶七下。但每打一下就在心里念一句，哥哥我爱你。`},
  27:{name:`玻璃罩蝴蝶`, location:`客厅书柜上的`, img:`assets/gifts/27.png`, story:`一个周末，派预定了一家手工店，出门做手工，历经九九八十一难，终于做出【玻璃罩蝴蝶】，骄傲拍图并连发18条朋友圈。粉丝问他为什么喜欢蝴蝶，他说：「我喜欢🦋的原因，就是蝴蝶很自由……我觉得它非常的浪漫🌹」
但其实是因为小远的明星符号就是蓝色蝴蝶，可惜不能说。`},
  31:{name:`星星抱枕`, location:``, story:``},
  35:{name:`锁头项链、钥匙项链`, location:`情侣配饰`, img:`assets/gifts/35.png`, story:`自从异地恋生活，小派每次看到小远跟新人的合照都会小小的醋涨了一下。小远知道后，给两人买了情侣配饰【锁、钥匙】，即使小远认识很多新人，小远爱情的锁只有派派可以开。`},
  37:{name:`黑框眼镜`, location:`客厅桌上的两副`, img:`assets/gifts/37.png`, story:`小远有高度近视，但是不爱带框架眼镜，他总感觉他戴上眼镜看起来很呆，但隐形又很伤眼，有时休息不好连轴转，一戴上隐形头就晕的不得了。
"在家里可以不用戴眼镜"，小派帮他滴完眼药水说，"框架压鼻梁，隐形伤眼睛，你把你自己全部交给我就好。"
于是小远被小派牵着洗漱吃饭上厕所，两个人靠在沙发上天南海北的聊，聊着聊着小远依偎着身边的温暖缓缓睡去。等他醒来，睡眼朦胧看见小派在他面前笑，不由自主伸手去勾眼镜，被小派一下子按住。
"干嘛？"小远不满意地嘟囔，只模糊看到小派的脸慢慢凑近。
"你别凑这么近，我看不清…"说着小远便要推开小派，没料到被人反手捉住压在沙发上，含着雾气的话喷得睫毛重重下垂，随着湿漉漉的吻压下来—— "你不用看清我，我们接吻吧。"
隔天他们一起去配了两副一样的黑框眼镜，一起带就不呆了。`},
  45:{name:`辣子鸡`, location:`餐桌上的（只有小远小派一起在厨房的画面才出现）`, img:`assets/gifts/45.png`, story:`晚上放学回到家，小远竟然在家，两个人亲密了一番后小派就被远叫去写作业了。小派吭哧吭哧写完作业，发现远做了小派最爱吃的辣子鸡。
男团刚成立的时候，小派刚从泰国来到中国，对中国料理说不上多热爱，直到小远深夜做了【辣子鸡】给他吃，从此这就是他最爱的料理了。他永远都会记得那个夜晚，整个团小远只叫他一个人来吃，他第一次感受到小远的温柔与关爱，他是他最特别的小孩。`},
  47:{name:`便条纸`, location:`冰箱上的`, img:`assets/gifts/47.jpg`, story:`「派，
我给你放了你爱吃的菜，记得吃。
你下次想吃什么再跟我说。」
小远来北京工作总是来去匆匆，但不管再忙都会给派派煮些拿手菜放在冰箱。派派只要看到冰箱贴就知道又有好吃的。`},
  55:{name:`垂耳兔粉绿帽`, location:``, story:`这个帽子是小远个人巡演的服装，每当他想到小派无法参加自己的演出就感到难受，但只要他还是偶像歌手，他们就不能公开。
因为这样，小远喜欢在演出里加入一些只有两个人才看得懂的符号，就像这顶垂耳兔粉绿帽——小派的应援色跟动物设定就是粉色的兔子。
演出结束后，小远把这顶帽子寄给了小派，弥补小派参与不了小远个人巡演的遗憾。`},
  57:{name:`环球影城合照`, location:`二楼窗台矮柜上的`, story:`小派盯着天气预报找到了一个凉快的晴天，预订了两张环球影城门票，又网购了两套巫师袍。
小派当然是不管前方如何都应勇向前的格兰芬多，伯远则是明知可能无果却依旧奋不顾身的赫奇帕奇！
伯远口嫌体正直，穿上衣服拿起魔法棒玩的不亦乐乎，一会帕绰糯一会啃大瓜，小派拿着胶卷相机给两人拍了好多照，到了最标致的地球前，小派请求旁边的一位姐姐帮忙，给二人拍了张合照。
近点，再近点，姐姐指挥到。
两人的脚尖靠拢，再靠拢，最终在快门按下的瞬间，小派揽住了伯远的肩膀。
不愧是英勇的格兰芬多，但下一秒，拿剑的勇士便涨红了脸，因为那位带着黄色围巾的巫师悄悄垫脚，在他耳边低声道：「我以为刚刚我们应该接吻的。」

近些，再靠近些。勇敢的求爱者会遇到一双结结实实捧住他炽热心脏的手。`},
  65:{name:`小王子氛围灯`, location:`二楼窗台矮柜上的`, img:`assets/gifts/65.png`, story:`小派跟小远说过小王子的故事，小王子守着他的玫瑰在小小的星球上，他们拥有彼此而不再孤单。看到这个礼物，小派哈特软软，气消了大半，别扭地发消息问伯远是不是你买的……
｛聊天内容｝`},
  67:{name:`专辑《闪闪》`, location:`客厅桌上的`, img:`assets/gifts/67.jpg`, story:`因为小远在歌手的路上越走越远，小派除了演员外对于音乐制作也有天赋，俩人在音乐上有了更多合作。派派写曲子、英文歌词，小远再帮小派填成中文、帮录和声。
渐渐地，在两人的歌曲里，常可以看到一个制作人署名 HY，这是两个人的暗号——HHYY，花好月圆似当年。`},
  75:{name:`相框及干燥花手链`, location:`一楼窗前矮柜上的邀请函、电影票相框跟干燥花`, story:`派派来中国的第一部电影上映，首映礼小派也给伯远寄了邀请函，可伯远不巧正好有音综节目的录制，实在去不了，小派心里不高兴表面却也强撑着。
等路演结束了，小派回到出租屋发现伯远悄悄回家给了他一个惊喜，俩人装备齐全遮的严严实实的去看了电影。
门口遇到卖花的阿婆，小派偷偷摸摸给伯远买了束花，阿婆问他是不是送给女朋友，小派笑着摇摇头说，是送给我哥的，我生命里很重要的人。
阿婆似懂非懂地点头，又送了他两个栀子花手链，阿婆说：今生戴花来世漂亮，你这辈子这么漂亮，下辈子一定也要漂漂亮亮的活。小派高兴地点头，拿去给伯远戴上，手环清香，萦绕在两人手腕间，花瓣若有似无的相互碰撞，手心热乎乎湿润润的。好紧张，哪怕牵手无数次，再牵手也还是像刚恋爱般紧张。`},
};

/* ---------------- 恋爱日记占位文案 ---------------- */
const DIARY_TEXT = {
  0:{title:`恋爱日记 · 楔子`, text:`—故事开始—
小派和小远在男团内偷偷摸摸地谈了恋爱,两年后男团解散直播的互送礼物环节,小派送给了小远一把[钥匙]。
「希望哥哥有空可以来找我玩!」
全团11个人,小派新房子的钥匙只送给了小远。没收到钥匙的其他人起哄着,小派笑弯了眼,小远也害羞地收下了。

男团解散后,小派成了大学生,吭哧吭哧地搬进了自己租的房,有厨房有大电视还有一张加大双人床!
小派想跟小远永远在一起,但解散后就不能像在团里一样每天黏在一起。
「如果远哥来的时候能睡在一起就好了……」小派想到这,傻笑了起来。`},
  9:{title:`恋爱日记 · 第一篇`, text:`小远是歌手,常在各地飞来飞去开演唱会,不能常来找他。虽然房子布置的很舒服,但小派总觉得房子还是空空的。

或许空空的不是房间,是少了一个人。

趁某次小远来找他,他们一起去逛街。
小派买了很多绿色的、带有蝴蝶跟狗狗元素的东西。小远看到忍不住也买了些粉色的、兔兔跟星星元素的东西,当回到家把东西全部摆出来后,两个人抱在一起笑了好久。
情侣杯、情侣饰品,这些在团里不能展现的爱意,充斥了两个人的家。`},
  19:{title:`恋爱日记 · 第二篇`, text:`小派读书很用功,考上电影学院后专业技能提升很快,不多时日便接到了电影的重要男配。煲电话粥的时间小远也会陪他一起对词,但更多时候只是开着扩音各自忙着自己的工作。
对他们来说,仅仅是听着电话那端的呼吸,也能感到幸福和安心。

辛苦拍戏的两个月里,小远有去探班,给一整个剧组买了奶茶希望他们可以多多照顾小派。杀青当天,小远又特别来片场接他回家,还做了许多他爱吃的饭菜。

两个人都在为了同一个梦想各自努力着。在外面小远是明星歌手,小派是大学生演员,但在家里,他们只是彼此爱的那个人。`},
  29:{title:`恋爱日记 · 第三篇`, text:`小派最近有点不高兴,因为小远的工作有点太忙了,而且小远在工作中好像遇见了…嗯…很多新的人。
异地恋,小派吃醋,小派心慌。
小远已经忙到没有精力和他解释,只是每天晚上给他发我爱你,但言语太淡,我爱你,打出来只需要三秒,就是小派这位小留学生用拼音打也只要八秒钟就好了。

三秒钟的爱不够,太薄,在小派不屈不挠撒娇要求下,换成语音。

虽然用嘴巴说只用一秒钟,但从这一秒钟里,小派能感知到很多东西,比如小远当时的状态、心情,他周遭的环境,近期嗓子的状态,还有,很多很多爱。
而世上很多美好珍贵的东西都是被锁在一秒钟里的,就像照片定格的瞬间,太阳跋涉越过云层的霎那,萌芽破土而出那一瞬息,还有小远糯着嗓子说的我爱你。

三秒钟和一秒钟不一样,小派有讲究的。`},
  39:{title:`恋爱日记 · 第四篇`, text:`身为歌手的小远在各地飞,偶尔来北京也是两三天就赶着要去下一个地方。小派特别珍惜这两三天,总是尽可能地跟小远待在一起。
这天小远在北京的雪碧音乐节彩排,但彩排时间很长,小远让小派去旁边咖啡厅等他,小派想了想跑去了隔壁的溜冰场溜冰。
他一直想带小远去溜冰跟滑雪,在德国长大的他对这类活动适应良好,尤其想看小远站不稳扶着他滑的样子。
「如果有一天能和远哥结婚就好了。去欧洲或任何一个没有人找得到我们的地方……」

他在朋友圈发了一段话:
"Let's run away 🏃🏻🦋"
好想一起逃离,去到只有你跟我的地方。
但我舍不得,舍不得你在舞台上发光的样子,舍不得你的歌声跟笑容。`},
  49:{title:`恋爱日记 · 第五篇`, text:`随着小远越来越红,小派即将毕业,两人的生活越发繁忙起来。
有时一天也说不到几句话,一个人发的消息另一个人总要很久之后才看到,一件有趣的事情往往都到诉说者没兴致了才能等来一句急匆匆的回复。
爱可以平淡,但不能销声匿迹。
当小远某一天发现,他已经四个月没见到小派时,他无来由地感到恐慌。
从每天几小时的电话粥,只是挂着电话听着彼此呼吸都感到幸福;到一周一句制式地我爱你,错过太多次电话而不敢回打电话给他,未接来电慢慢也就没有了。
炙热的爱意被自己浇熄了,繁忙已经不能做为他的借口。

他还爱着小派吗?无庸置疑地,但生活忙忙碌碌,习惯了另一方理所当然地主动,随时把自己的灵魂抛出去都可以被接住的安心感。
但这世上哪里会有天造地设的一对,有时候爱足够,但缘分到头,也是枉然。`},
  59:{title:`恋爱日记 · 第六篇`, text:`秋天来了,冷空气来了,云层一天比一天厚,直到再也兜不住雨,发泄似地下了一天一夜。在小派做完毕业小组作业的那天晚上,接到了小远打来的电话。
他几乎没犹豫直接接听了,那头却不说话,只能听见风声、雨声、呼吸声——那是他最熟悉的声音,即使隔着电话,他仿佛也能感受到那湿热的吐息。

半晌,他先开口打破沉默:"怎么了?"
"没事"电话那端的声音很艰涩,"刚下工,我们这下雨了,我想,北京也可能被淋湿。"
"我在家。"尹浩宇回。
"刚刚没想起来。"伯远干巴巴笑了两下,"我只是觉得,如果雨一定要落下的话,那个时刻我们应该站在一起,撑同一把伞。"

在爱情里,小派从来就是最勇敢的,他不明白相爱的人为什么不能在一起,只是社会太复杂,需要解决的问题太多,一个人磕碰走不完这条路。但如果两个人肩挨着肩,雨过,总会天晴。

小派隔天在朋友圈发了一段话:
"morning sunshine☀️"​`},
  69:{title:`恋爱日记 · 第七篇`, text:`那天之后,伯远把工作重心迁来北京,他签了北京的经纪公司,拎着一行李箱脏衣服强势入驻尹派小家。
小派欢喜得很,提前买好了一冰箱零食饮料,又被伯远以长身体的小孩不能吃太多零食为名耳提面命送走大部分给隔壁邻居。
小派死守着最后一包浪味仙藏匿在床头柜,在一个浓情蜜意的晚上被残忍发现并当场缴获。但夜还很长,没得吃的小派还有很多事可以做……刚甜蜜同居的两个人,过了好一段没羞没臊的日子。

爱情从来没有完美,不能称作童话,遇不到荆棘遍布的丛林,也不会长出充满魔法的头发,每个人都平凡又普通着,源于爱和热爱,不厌其烦地解决一些不足为道的问题、鸡毛蒜皮的小事,刮腻子般堆砌起泥砖瓦筑的墙体。

东补补,西扛扛,一块砖贴着一块砖,一堵墙挨着一堵墙。
再一回神,便见一个家了。`},
  79:{title:`恋爱日记 · 第八篇(完)`, text:`尹浩宇的电影陆陆续续上映,受到了一致好评,还有一部入围了戛纳电影节。恰巧伯远最近得空,本想回家休整一下,架不住尹浩宇软磨硬泡,最终还是大包小包的陪着孩子去了法国。
法国饮食伯远吃不惯,小孩的胃也早被他调理的和他一致,于是这次差点超重的行李箱里塞的全是中国的一些调味料,火锅底料、酸菜鱼料、麻辣香锅…伯远到酒店的第一件事便是搜索最近的超市。小孩在法国几天虽然辛苦,却不瘦反胖,伯远居功自傲,擅自安排了尹浩宇为他捏肩挠背一系列报恩服务。
电影节终于走向尾声,伯远哼哧哼哧收拾好行李却被通知他们还要在法国呆两天,不明所以的他被临时导游尹浩宇带着游览了法国的特色建筑,等走到埃菲尔铁塔下已经是临近日落了。
天空是淡淡的橙,太阳悬在矮矮的树头,风在吹,很凉。伯远往手里哈气,复又去抓尹浩宇的,却发现他手心微微出汗。这就是年轻人的火力啊,伯远心道,想把手抽出塞回口袋保暖,却发现已经被人死死攥住。
"汤浩,"冷空气晕着塞纳尔湖淡淡的咸味,混着他俩身上相同的洗衣凝珠香气,裹挟着他的声音,羞怯怯送到伯远耳朵里,
"我来法国之前在中介那里预定了一套房子,是一间面海大平层,朝向好,光照足,有一个空中花园可以种花,当然,也可以种折耳根,我捏着鼻子就好了。
我们的工作比较特殊,或许有一天,我们能站到阳光下接受大家的祝福。
但在这之前……你愿意和我结婚吗?"

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

/* ============================================================
   关卡参数化生成
   ============================================================ */
function generateLevelConfig(n){
  const isMilestone = MILESTONES.includes(n);
  const isSpecialLevel = isMilestone || MEMENTO_LEVELS.includes(n); // 小派/小远只在这些关卡顶替兔兔/狗狗出现

  // 50关前整体放宽(棋盘小、图案少、步数松),50关后再逐步拉回难度
  const size = n<=20?6 : n<=35?7 : n<=50?8 : 9;
  const tileTypes = n<=10?4 : n<=29?5 : n<=49?7 : n<=59?9 : n<=69?10 : 11; // 1-10蝴蝶/星星/兔兔/狗狗,11+月亮,30+电影板+麦克风,50+玫瑰+小狗,60+太阳,70+爱心
  const cellCount = size*size;

  let moves, targetScore, numFrozen;
  if(n<=50){
    moves = Math.max(16, 26 - Math.floor(n/8));
    targetScore = Math.round(cellCount * (12 + n*0.6));
    numFrozen = Math.min(Math.floor(n/5), Math.floor(cellCount*0.15));
  } else {
    moves = Math.max(12, (26 - Math.floor(50/8)) - Math.floor((n-50)/3));
    targetScore = Math.round(cellCount * (12 + 50*0.6 + (n-50)*1.1));
    numFrozen = Math.min(Math.floor(10 + (n-50)/2), Math.floor(cellCount*0.22));
  }

  if(isMilestone){
    moves += 4;
    targetScore = Math.round(targetScore*1.15);
    numFrozen = Math.min(numFrozen+2, Math.floor(cellCount*0.26));
  }
  return { level:n, rows:size, cols:size, tileTypes, moves, targetScore, numFrozen, isMilestone, isSpecialLevel };
}

/* ============================================================
   存档
   ============================================================ */
function loadState(){
  const defaults = { unlockedLevel:1, totalCleared:0, mementos:[0], postcards:[], diaryUnlocked:[], mementosSeen:0, postcardsSeen:0, lives:MAX_LIVES, nextRegenAt:null, homeTutorialSeen:false, levelTutorialSeen:false };
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
  livesTimer = setInterval(()=>{ regenLives(); updateLivesUI(); }, 1000);
}
function stopLivesTimer(){
  if(livesTimer){ clearInterval(livesTimer); livesTimer=null; }
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
  });
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
    showScreen(target==='home' ? 'screen-home' : 'screen-'+target);
  });
});

/* 第一次打开首页时的一次性玩法导览,dismiss 后写 flag 永远不再跳出 */
function maybeShowHomeTutorial(){
  if(STATE.homeTutorialSeen) return;
  STATE.homeTutorialSeen = true;
  saveState();
  showModalQueue([{type:'tutorial-home'}], 'screen-home');
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
  const lvl = Math.min(STATE.unlockedLevel, TOTAL_LEVELS);
  document.getElementById('home-level-text').textContent =
    STATE.unlockedLevel > TOTAL_LEVELS ? `完结 · 已结婚 💍` : `第 ${lvl} 关 / 共 ${TOTAL_LEVELS} 关`;
  document.getElementById('home-progress-fill').style.width =
    Math.min(100, STATE.totalCleared/TOTAL_LEVELS*100)+'%';
  document.getElementById('gift-count').hidden = STATE.mementos.length <= STATE.mementosSeen;
  document.getElementById('postcard-count').hidden = STATE.postcards.length <= STATE.postcardsSeen;

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

document.getElementById('hotspot-diary').addEventListener('click', ()=> showScreen('screen-map'));
document.getElementById('hotspot-gift').addEventListener('click', ()=> openAlbum('memento'));
document.getElementById('hotspot-postcard').addEventListener('click', ()=> openAlbum('postcard'));
document.getElementById('btn-reset').addEventListener('click', ()=>{
  if(confirm('确定要重置所有进度吗?(测试用)')){
    localStorage.removeItem(SAVE_KEY);
    STATE = loadState();
    refreshHome();
  }
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
        showModalQueue([{type:'diary', level:n, reread:true}]);
      });
      wrap.appendChild(heart);
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
  };
  BOARD.cells = generateSolvableBoard(cfg);

  document.getElementById('board-level-title').textContent = `第 ${levelNum} 关`;
  const badge = document.getElementById('board-milestone-badge');
  badge.hidden = !cfg.isMilestone;
  document.getElementById('board-moves-left').textContent = BOARD.movesLeft;
  document.getElementById('board-score-current').textContent = 0;
  document.getElementById('board-score-target').textContent = cfg.targetScore;
  document.getElementById('board-score-fill').style.width = '0%';

  selectedCell = null;
  showScreen('screen-board');
  renderBoard();

  if(!STATE.levelTutorialSeen){
    STATE.levelTutorialSeen = true;
    saveState();
    showModalQueue([{type:'tutorial-level'}], 'screen-board');
  }
}

function randType(n){ return Math.floor(Math.random()*n); }

/* 剧情/纪念品关卡:抽到兔兔/狗狗时直接顶替成小派/小远,图案总数不变 */
function pickType(cfg){
  const t = randType(cfg.tileTypes);
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
function showBoardToast(msg){
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
  boardToastTimer = setTimeout(()=> el.classList.remove('show'), 1600);
}

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
  moonBurstTimer = setTimeout(()=> el.classList.remove('show'), 1300);
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

function renderBoard(){
  const grid = document.getElementById('board-grid');
  const cfg = BOARD.config;
  grid.innerHTML = '';

  const wrap = grid.getBoundingClientRect();
  const gap = 4;
  const size = Math.max(20, Math.floor(Math.min(
    (wrap.width - gap*(cfg.cols-1)) / cfg.cols,
    (wrap.height - gap*(cfg.rows-1)) / cfg.rows
  )));
  grid.style.gridTemplateColumns = `repeat(${cfg.cols}, ${size}px)`;
  grid.style.gridTemplateRows = `repeat(${cfg.rows}, ${size}px)`;

  for(let r=0;r<cfg.rows;r++){
    for(let c=0;c<cfg.cols;c++){
      const cell = BOARD.cells[r][c];
      const div = document.createElement('div');
      div.className = 'tile' + (cell.frozen ? ' frozen' : '');
      div.style.width = size+'px';
      div.style.height = size+'px';
      div.style.background = TILE_TYPES[cell.type].bg;
      div.dataset.r = r;
      div.dataset.c = c;
      div.innerHTML = `<img src="${TILE_TYPES[cell.type].img}" alt="" draggable="false">`;
      div.addEventListener('pointerdown', onPointerDown);
      grid.appendChild(div);
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

function onPointerDown(e){
  if(BOARD.busy) return;
  const r = +e.currentTarget.dataset.r, c = +e.currentTarget.dataset.c;
  pointerDrag = { r, c, x:e.clientX, y:e.clientY, dragged:false };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function onPointerMove(e){
  if(!pointerDrag || pointerDrag.dragged || BOARD.busy) return;
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

  BOARD.movesLeft--;
  document.getElementById('board-moves-left').textContent = BOARD.movesLeft;
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
    checkLevelEnd();
    return;
  }

  // 各种图案的特殊效果
  let bombed = false;
  let bonusMoves = 0;
  let specialMsg = null;
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
          matched.add(nr+','+nc);
          bombed = true;
        }
      }
    }

    // 40关后,蝴蝶4连以上:清空整排(横向连成就清空该行,纵向连成就清空该列)
    if(type===BUTTERFLY_IDX && cfg.level>=40 && run.length>=4){
      if(isHorizontal){
        for(let c=0;c<cfg.cols;c++) if(BOARD.cells[rr][c] && !matched.has(rr+','+c)) matched.add(rr+','+c);
      } else {
        for(let r=0;r<cfg.rows;r++) if(BOARD.cells[r][rc] && !matched.has(r+','+rc)) matched.add(r+','+rc);
      }
      specialMsg = `"Let's run away 🏃🏻🦋"`;
    }

    // 60关后,太阳配对成功:以命中点为中心,清空十字型两排(整行+整列)
    if(type===SUN_IDX && cfg.level>=60){
      const [mr,mc] = run[Math.floor(run.length/2)];
      for(let c=0;c<cfg.cols;c++) if(BOARD.cells[mr][c] && !matched.has(mr+','+c)) matched.add(mr+','+c);
      for(let r=0;r<cfg.rows;r++) if(BOARD.cells[r][mc] && !matched.has(r+','+mc)) matched.add(r+','+mc);
      specialMsg = `"morning sunshine☀️"`;
    }

    // 狗狗/小远配对成功:步数 +1;兔兔/小派配对成功:步数 +1
    if(type===DOGFACE_IDX || type===XIAOYUAN_IDX){
      bonusMoves += 1;
      specialMsg = '🐾 狗狗组合!步数 +1';
    }
    if(type===BUNNY_IDX || type===XIAOPAI_IDX){
      bonusMoves += 1;
      specialMsg = '🐰 兔兔组合!步数 +1';
    }
  });
  if(bonusMoves>0){
    BOARD.movesLeft += bonusMoves;
    document.getElementById('board-moves-left').textContent = BOARD.movesLeft;
  }
  if(bombed){
    showMoonBurst();
    showBoardToast('🌙 月兔合體炸开了阻礙!');
  } else if(specialMsg) showBoardToast(specialMsg);

  // 解冻相邻冰冻格
  matched.forEach(key=>{
    const [r,c] = key.split(',').map(Number);
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr,nc])=>{
      if(inBounds(nr,nc,cfg) && BOARD.cells[nr][nc] && BOARD.cells[nr][nc].frozen && !matched.has(nr+','+nc)){
        BOARD.cells[nr][nc].frozen = false;
      }
    });
  });

  // 计分:每格 10 分 * 连锁倍数,额外长串奖励
  let gained = matched.size * 10 * combo;
  matched.forEach(()=>{});
  BOARD.score += gained;
  document.getElementById('board-score-current').textContent = BOARD.score;
  document.getElementById('board-score-fill').style.width =
    Math.min(100, BOARD.score/cfg.targetScore*100)+'%';

  // 播放消除动画
  matched.forEach(key=>{
    const [r,c] = key.split(',').map(Number);
    const el = document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
    if(el) el.classList.add('clearing');
  });

  setTimeout(()=>{
    matched.forEach(key=>{
      const [r,c] = key.split(',').map(Number);
      BOARD.cells[r][c] = null;
    });
    applyGravity(cfg);
    renderBoard();
    setTimeout(()=> resolveCascade(combo+1), 180);
  }, 180);
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
    if(MEMENTO_LEVELS.includes(levelNum) && !STATE.mementos.includes(levelNum)){
      STATE.mementos.push(levelNum);
      saveState();
      queue.push({type:'memento', level:levelNum});
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
    }

    if(MILESTONES.includes(levelNum) && !STATE.diaryUnlocked.includes(levelNum)){
      STATE.diaryUnlocked.push(levelNum);
      saveState();
      queue.push({type:'diary', level:levelNum});
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
  card.classList.toggle('memento-mode', step.type==='memento');

  if(step.type==='tutorial-home'){
    card.innerHTML = `
      <div class="modal-emoji">🏠</div>
      <h3>欢迎来到小派与小远的家</h3>
      <div class="tutorial-list">
        <div class="tutorial-row"><span class="tutorial-icon">💕</span><div><b>爱心</b><br>体力值,每次挑战扣1颗,过一段时间会自动恢复。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">📖</span><div><b>恋爱日记</b><br>点这里进入关卡地图,开始消除游戏。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">🎁</span><div><b>纪念品</b><br>过关收集到的纪念品都收藏在这里。</div></div>
        <div class="tutorial-row"><span class="tutorial-icon">💌</span><div><b>明信片</b><br>小远出差回来会带回明信片,集满全部看看有什么惊喜。</div></div>
      </div>
      <button class="modal-btn" id="modal-next">开始游戏</button>`;
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
  } else if(step.type==='memento'){
    const m = MEMENTO_ITEMS[step.level];
    const photoInner = m.img ? `<img src="${m.img}" alt="">` : `<div class="memento-photo-fallback">💝</div>`;
    const combinedText = m.story || '';
    card.innerHTML = `
      <div class="memento-card">
        <div class="memento-photo-circle">${photoInner}</div>
        <div class="memento-card-inner" id="diary-inner">
          <h3>${step.reread ? '' : '获得纪念品 · '}${m.name}</h3>
          <div class="diary-page-text" id="diary-page-text"></div>
          <div class="diary-page-nav" id="diary-page-nav" hidden>
            <button class="diary-page-arrow" id="diary-prev" title="上一页">‹</button>
            <div class="diary-page-dots" id="diary-dots"></div>
            <button class="diary-page-arrow" id="diary-next" title="下一页">›</button>
          </div>
        </div>
      </div>
      <button class="modal-btn diary-close-btn" id="modal-next">${step.reread ? '关闭' : '收下'}</button>`;
    layoutCardBg('.memento-card', 'memento-mode');
    setupDiaryPagination(combinedText);
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
  }

  const nextBtn = card.querySelector('#modal-next');
  if(nextBtn) nextBtn.addEventListener('click', showNextModal);
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
