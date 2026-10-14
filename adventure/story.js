/* 桃源行：敘事與分支。情境、對話為改編；原文獨立置於 sources。 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Taoyuan=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const C=(id,label,to,set={},note='')=>({id,label,to,set,note});
const sources=[
{title:'入林',quote:'緣溪行，忘路之遠近。忽逢桃花林，夾岸數百步，中無雜樹，芳草鮮美，落英繽紛。漁人甚異之，復前行，欲窮其林。',note:'「鮮美」指花草鮮嫩美麗；「窮」指走到盡頭。'},
{title:'探洞',quote:'林盡水源，便得一山。山有小口，彷彿若有光。便捨船，從口入。初極狹，纔通人。復行數十步，豁然開朗。',note:'「纔通人」是僅容一人通過；「豁然開朗」是眼前忽然開闊明亮。'},
{title:'遇人',quote:'土地平曠，屋舍儼然，有良田、美池、桑竹之屬。阡陌交通，雞犬相聞。……見漁人，乃大驚，問所從來。具答之。便要還家，設酒殺雞作食。',note:'「阡陌」是田間小路；「具」是詳細；「要」通「邀」。省略處以刪節號標示。'}
];
function initial(){return {version:1,node:'start',flags:{trust:0},trail:[]};}
function node(s){
const f=s.flags;
const N=(chapter,title,text,choices,extra={})=>({chapter,title,text,choices,...extra});
switch(s.node){
case 'start':return N(0,'忘路之遠近',[
'我以捕魚為生。這天，只顧著沿溪尋魚，不知不覺，已把熟悉的岸邊拋在身後。',
'一片花瓣碰上船舷。我抬起頭，兩岸竟都是桃花。風從林間吹來，水面像鋪了一條淡紅的路。'
],[C('listen','停下船槳，聽一聽','water',{listened:true},'你曾停槳聽水。'),C('drift','循著落花，繼續往前','grove',{pace:'drift'},'你循著落花溯溪。')]);
case 'water':return N(0,'水聲之外',[
'槳葉離開水面，四周忽然安靜。我聽見花落在水上的細響；再遠一點，似乎還有一聲雞鳴。',
'這樣深的山裡，竟有人家？我把那個聲音記在心裡，重新握住船槳。'
],[C('follow','朝聲音傳來的方向划去','grove')],{echo:'停下來，才聽見水聲以外的聲音。'});
case 'grove':return N(0,'兩岸，只有桃花',[
f.listened?'那聲雞鳴再沒有響起。桃林卻愈來愈密，枝梢低得幾乎拂過我的肩。':'船穿過層層花影。來時的山已看不見了，桃林卻仍沒有盡頭。',
'岸邊有一處淺灘，正好能靠船。再往前，溪流在山腳轉了個彎。'
],[C('observe','靠上淺灘，仔細看看桃林','observe',{observed:true},'你發現林中沒有雜樹。'),C('petal','拾起一片落花，留在掌中','petal',{petal:true},'你留下了一片桃花。'),C('onward','不再停留，划向山腳','source',{hurried:true},'你選擇直接尋找水源。')]);
case 'observe':return N(0,'沒有別的樹',[
'我踩上淺灘。朝林子深處看去，枝幹一層疊著一層，竟找不出一棵別的樹。',
'腳邊青草柔軟，落花沾在鞋面。這片桃林實在奇異；若見到住在此地的人，我想問問，他們可知道這片林子。'
],[C('remember','記住這片林子，回船前行','source'),C('keep','也帶一片落花，再繼續走','petal',{petal:true},'你把觀察與一片落花一同帶走。')],{echo:'這個發現，或許能成為與人交談的起點。'});
case 'petal':return N(0,'掌中的春色',[
'我從衣襟裡找出一塊乾布，把花瓣輕輕收好。它太薄，指尖稍微用力就會留下痕跡。',
'船又往前。轉過山腳，桃樹在水源旁停了下來，眼前只剩一面覆著青苔的石壁。'
],[C('reach','把船繫好，走近石壁','source')]);
case 'source':return N(1,'山有小口',[
'水從亂石間滲出。山壁上有個小口，窄得像一道裂縫，深處卻透著光。',
f.listened?'先前聽見的雞鳴，此刻又隱約響了一聲。我把耳朵貼近石壁，想知道聲音是否來自另一頭。':'我將船繫在岸邊，探身向裡望。光時明時暗，還看不出另一頭是什麼。'
],[C('listenCave','先聽清楚，再踏進去','threshold',{careful:true},'你先聽清洞後的動靜。'),C('enter','側過身，直接走向微光','tight',{careful:false},'你先進了狹窄的石縫。')]);
case 'threshold':return N(1,'石壁另一頭',[
'我屏住呼吸。水聲裡，夾著極遠的狗吠。那裡應該真有人。',
'我沿乾燥的岩面慢慢側身，把衣襟護在胸前。越走，光越亮。'
],[C('call','朝光裡喊一聲：「有人嗎？」','clearing',{called:true},'你的招呼先傳到了田裡。'),C('quiet','先不出聲，輕輕走出去','clearing',{called:false},'你安靜地穿過了石縫。')]);
case 'tight':return N(1,'只容一人',[
'肩頭碰上石壁，我才知道這道口子比想像中更窄。腳下的青苔濕滑，亮處卻已近在眼前。',
f.petal?'衣襟裡那片花瓣貼著胸口。我停了一下，想護好它，也想站穩腳步。':'石縫裡有冷風流過。我得決定，下一步要踩在哪裡。'
],[C('steady','放慢腳步，扶著岩壁走','clearing',{careful:true},'你放慢腳步，平穩地走出洞口。'),C('rush','趁著亮光，快步穿過去','clearing',{wet:true},'你急著出洞，鞋襪沾濕了。')]);
case 'clearing':return N(2,'豁然開朗',[
'再走幾十步，石壁忽然退開。眼前是平坦的田地、整齊的屋舍；桑樹和竹子在風裡輕輕搖動。',
f.wet?'我踩進一窪淺水，濺濕了鞋襪。田裡有人抬起頭，手上的鋤頭停在半空。':f.called?'田裡一位老人循著我的聲音轉過身。看見我，他愣了一下，隨即放下手裡的活。':'我沿田埂望去。遠處有孩子奔跑，也有老人坐在門前，像是各自安穩地過著這一天。'
],[C('greet','走近田邊，先向老人問候','meet',{trust:1},'你先向老人問候。'),C('fields','沿田埂走一小段，看看村子','fields')],{echo:f.wet?'匆忙的一步，讓你帶著濕鞋走進村子。':f.called?'老人已先聽見你的聲音。':null});
case 'fields':return N(2,'阡陌之間',[
'小路把田與田接在一起。幾聲雞鳴從屋後傳來，一個孩子追著滾落的竹球，停在我的腳邊。',
'孩子抬頭看我，笑容忽然收了起來。一位老人也注意到了這個陌生面孔，朝這邊走來。'
],[C('help','拾起竹球，輕輕交給孩子','meet',{helped:true,trust:2},'你替孩子拾回竹球。'),C('wait','退開一步，讓孩子先過去','meet',{reserved:true},'你留出距離，等村人開口。')]);
case 'meet':return N(2,'你從哪裡來？',[
f.helped?'孩子接過竹球，躲到老人身後，又忍不住探出頭來。老人看了看孩子，再看向我，神色稍微鬆了下來。':f.wet?'老人先看了看我濕透的鞋，又望向身後的山口。「你是從那裡來的？」':f.called?'「方才喊話的是你？」老人望向山口，滿臉驚訝。':f.reserved?'老人站在幾步之外。孩子已跑回村裡，幾個人從門前探出身來。':'老人停在田邊，打量著我的衣著，滿臉驚訝。',
'「你從哪裡來？怎麼走到這兒的？」他問。'
],[
C('honest','說明我是漁人，沿溪迷了路','welcome',{trust:f.trust+2,answer:'honest'},'你如實說出了來歷。'),
...(f.observed?[C('flowers','說起那片沒有雜樹的桃林','welcome',{trust:f.trust+2,answer:'flowers'},'你用桃林的觀察打開了話題。')]:f.petal?[C('show','拿出花瓣，說明來時的路','welcome',{trust:f.trust+2,answer:'petal'},'你拿出了沿途保存的花瓣。')]:[]),
C('guard','先問這裡是什麼地方','guarded',{answer:'guard'},'你暫時保留了自己的來歷。')
]);
case 'guarded':return N(2,'隔著一道田埂',[
'「你還沒說，是從哪裡來的。」老人沒有責怪，卻也沒有再走近。',
f.helped?'孩子牽了牽他的袖子，指向手裡的竹球。老人看著我，仍在等一句回答。':'我回頭看向山口。對我而言這裡陌生；對他們而言，我也一樣。'
],[C('explain','告訴他實情：我只是迷了路','welcome',{trust:f.trust+2,answer:'honest'},'你補上了自己的來歷，談話繼續了。'),C('waterOnly','先借一碗水，在田邊歇歇','endWater',{ending:'water'},'你選擇先在田邊停留。')]);
case 'welcome':return N(2,'一個可以坐下的地方',[
f.answer==='flowers'?'「一路都是桃樹？」老人聽完，轉頭望了望山口。「你看得很仔細。先到家裡坐吧，再慢慢說。」':f.answer==='petal'?'我攤開乾布。老人看著那片花瓣，聽我說溪上的經過。「原來是這樣。走，到家裡坐坐。」':'我把捕魚、溯溪、誤入山口的經過說了一遍。老人聽完，朝村裡招了招手。「走，先到家裡歇歇。」',
f.helped?'孩子走在前頭，捧著竹球，時不時回頭等我。':f.wet?'老人讓我在門前換下濕鞋，拿了塊乾布過來。先前那一步的狼狽，此刻倒讓我們都笑了。':f.petal&&f.answer!=='petal'?'我跟在他身後，隔著衣襟摸了摸那片花瓣。這一路的奇遇，終於有了可以說話的人。':'炊煙從屋後升起。我走過門檻，忽然聞到飯菜的香氣。'
],[C('history','坐到老人身旁，問起村子的來歷','endHistory',{ending:'history'},'你選擇聽村子的往事。'),C('life','跟著孩子，看看門前的日常','endLife',{ending:'life'},'你選擇走近村裡的日常。')],{echo:f.answer==='flowers'?'桃林裡的觀察，成了此刻的話題。':f.answer==='petal'?'留在掌中的花，替你帶來了話題。':f.helped?'一個小小的善意，讓同行的路少了距離。':null});
case 'endHistory':return N(2,'一席舊事',[
'老人說，祖先為了避開秦時的戰亂，帶著妻子兒女與同鄉來到這裡。從此，便與外界斷了往來。',
'「如今外面，是什麼世道？」他問。我才明白，我沿溪走過的那段路，竟隔開了這麼長的歲月。',
'飯菜端上桌，我在席邊坐穩。這一次，我願意多坐一會兒。'
],[],{ending:true,subtitle:'你讓來歷成為故事，也聽見了他們的來歷。',original:'自云先世避秦時亂，率妻子邑人來此絕境，不復出焉，遂與外人間隔。'});
case 'endLife':return N(2,'門前春日',[
'孩子把竹球輕輕推向我。屋後雞鳴，隔壁有人喊著開飯；老人坐在門前，看我們玩了一回，又一回。',
f.observed?'我想起岸邊沒有雜樹的桃林。那時只覺奇異，此刻卻更想知道，這樣平靜的一天，村裡人已過了多久。':'我漸漸忘了濕氣、山路與先前的不安。雞鳴與人聲，原來可以這樣使人安心。',
'「進來吃吧。」屋裡有人招呼。孩子拉了拉我的袖子。'
],[],{ending:true,subtitle:'你從一場小遊戲，走近了桃源的日常。',original:'黃髮垂髫，並怡然自樂。'});
case 'endWater':return N(2,'田邊一碗水',[
'老人讓孩子端來一碗水，自己坐到田埂另一側。我喝了一口，水很清涼。',
'我們還沒有說很多話。遠處的飯香飄過來，他問我要不要再歇一會兒。',
'我捧著碗，看著山口。也許下一次開口，可以從自己的來歷說起。'
],[],{ending:true,subtitle:'你保留了距離，故事暫時停在田埂邊。',original:'見漁人，乃大驚，問所從來。具答之。'});
default:throw new Error('Unknown story node');
}}
function advance(s,id){const c=node(s).choices.find(c=>c.id===id);if(!c)throw new Error('Invalid choice');return {version:1,node:c.to,flags:{...s.flags,...c.set},trail:[...s.trail,id]};}
function replay(trail){if(!Array.isArray(trail)||trail.length>30)throw new Error('Invalid trail');return trail.reduce((s,id)=>advance(s,id),initial());}
function journal(s){let cursor=initial();return s.trail.map(id=>{const n=node(cursor);const c=n.choices.find(c=>c.id===id);cursor=advance(cursor,id);return {chapter:n.chapter,title:n.title,label:c.label,note:c.note};});}
return {initial,node,advance,replay,journal,sources};
});
