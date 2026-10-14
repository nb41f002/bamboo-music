'use strict';
(()=>{
const G=window.Taoyuan,$=id=>document.getElementById(id);
const key='bamboo.taoyuan.adventure.v1';
const scenes=[
{file:'forest',alt:'桃花夾岸，漁舟停在青綠溪水邊',line:'忽逢桃花林，夾岸數百步。',name:'壹 / 入林'},
{file:'cave',alt:'幽暗的狹窄石縫透出通往山谷的光',line:'山有小口，彷彿若有光。',name:'貳 / 探洞'},
{file:'village',alt:'阡陌交錯的村落，老人與孩子在田間小路上',line:'黃髮垂髫，並怡然自樂。',name:'參 / 遇人'}
];
let state=G.initial(), saved=null, started=false, locked=false, sceneIndex=0, toastTimer,storageWarned=false;
const e=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
try{const raw=JSON.parse(localStorage.getItem(key));if(raw&&raw.version===1)saved=G.replay(raw.trail);}catch(_){saved=null;}
$('resume').hidden=!saved||!saved.trail.length;
function toast(message){$('status').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('status').textContent='';},4500);}
function save(){try{localStorage.setItem(key,JSON.stringify({version:1,trail:state.trail}));saved=state;}catch(_){if(!storageWarned){toast('此瀏覽器無法保存進度；仍可完成這次旅程。');storageWarned=true;}}}
function switchScene(chapter){
document.body.dataset.scene=String(chapter);
if(sceneIndex!==chapter){const art=scenes[chapter];$('scene').src='./assets/'+art.file+'.webp';$('scene').alt=art.alt;sceneIndex=chapter;}
$('scene-line').textContent=scenes[chapter].line;$('scene-count').textContent=scenes[chapter].name;
}
function sheet(title,content){$('sheet-title').textContent=title;$('sheet-body').replaceChildren(content);$('sheet').showModal();}
function closeSheet(){$('sheet').close();}
$('close-sheet').onclick=closeSheet;
$('sheet').addEventListener('click',ev=>{if(ev.target===$('sheet')){const r=$('sheet').getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)closeSheet();}});
function travel(next){
if(locked)return;locked=true;state=next;save();render(true);setTimeout(()=>{locked=false;},280);
}
function begin(resume=false){state=resume&&saved?saved:G.initial();started=true;document.body.classList.add('playing');$('welcome').hidden=true;$('play').hidden=false;save();render(true);}
$('start').onclick=()=>{if(saved&&saved.trail.length){const box=e('div',undefined,'sheet-copy');box.append(e('p','重新出發會取代這個瀏覽器裡的旅程進度。'));const yes=e('button','重新循溪而行','primary');yes.onclick=()=>{closeSheet();begin();};const no=e('button','接續上次的旅程','resume');no.onclick=()=>{closeSheet();begin(true);};box.append(yes,no);sheet('重新出發',box);}else begin();};
$('resume').onclick=()=>begin(true);
function render(focus=false){
const n=G.node(state);switchScene(n.chapter);
document.querySelectorAll('[data-chapter]').forEach(el=>{const i=Number(el.dataset.chapter);el.className=i===n.chapter?'current':i<n.chapter?'done':'';if(i===n.chapter)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
$('moment').textContent=n.ending?'第一回・此刻停留':['溪流帶路','循光而行','與人相逢'][n.chapter];
$('story-title').textContent=n.title;$('prose').replaceChildren(...n.text.map(p=>e('p',p)));
$('echo').hidden=!n.echo;$('echo').textContent=n.echo||'';
$('choices').replaceChildren();$('choices').hidden=n.ending===true;
n.choices.forEach((c,i)=>{const b=e('button',undefined,'choice');b.append(e('small',['一','二','三'][i]),e('span',c.label),e('span','→','arrow'));b.setAttribute('aria-label',c.label);b.onclick=()=>travel(G.advance(state,c.id));$('choices').append(b);});
$('back').disabled=state.trail.length===0;$('ending').hidden=!n.ending;$('ending').replaceChildren();
if(n.ending){
const label=e('p','這一路，留下了什麼','end-label');
const list=e('ul',undefined,'trace');
const highlights=G.journal(state).filter(x=>x.note);
const selected=[highlights.filter(x=>x.chapter===0).pop(),highlights.filter(x=>x.chapter===1).pop(),highlights.filter(x=>x.chapter===2).pop()].filter(Boolean);
selected.forEach(x=>list.append(e('li',x.note)));
const actions=e('div',undefined,'ending-actions');
const retry=e('button','回到剛才，試另一個回答','primary');retry.onclick=()=>travel(G.replay(state.trail.slice(0,-1)));
const restart=e('button','重新循溪而行','secondary');restart.onclick=()=>begin();
actions.append(retry,restart);
$('ending').append(e('p',n.subtitle,'end-note'),label,list,actions,e('p','「入林・探洞・遇人」試玩段落到此。三種停留，來自不同選擇。返程故事尚未開放。','end-finish'));
}
const p=$('passage');p.classList.remove('enter');void p.offsetWidth;p.classList.add('enter');
if(focus){$('story-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}
$('back').onclick=()=>{if(state.trail.length)travel(G.replay(state.trail.slice(0,-1)));};
$('journal').onclick=()=>{
const box=e('div');const items=started?G.journal(state):saved?G.journal(saved):[];
if(!items.length)box.append(e('p','還沒有留下足跡。從桃林開始，讓這一頁慢慢寫滿。','sheet-copy'));
else{const list=e('ol',undefined,'journey');items.forEach(item=>{const li=e('li');li.append(e('small',item.title),e('p',item.label));if(item.note)li.append(e('p',item.note,'note'));list.append(li);});box.append(list);}
box.append(e('p','進度只保存在目前的瀏覽器。清除網站資料或使用其他裝置，不會帶入這段行記。','sheet-note'));sheet('沿途行記',box);
};
$('source').onclick=()=>{
const n=G.node(state),src=G.sources[n.chapter];const box=e('div',undefined,'sheet-copy');
box.append(e('p','陶淵明〈桃花源記〉・'+src.title),e('blockquote',n.original||src.quote),e('p',n.originalNote||src.note),e('p','遊戲中的第一人稱情境、選項與對話為改編；以上單獨列出原文。','sheet-note'));sheet('回到原文',box);
};
$('about').onclick=()=>{
const box=e('div',undefined,'sheet-copy');
box.append(e('p','《桃源行》是竹簡樂府的文字冒險。你扮演武陵漁人，以觀察、行動與對話走進〈桃花源記〉。'),
e('h3','一段故事，幾種相逢'),e('p','入林時留下的觀察或花瓣，會帶來不同的對話選項；探洞的步伐與招呼影響相遇情境；你的回答決定這一回停留在哪裡。可用「上一個選擇」探索其他走法。'),
e('h3','原文與改編'),e('p','古文取自陶淵明〈桃花源記〉，沿用竹簡樂府既有文本。第一人稱敘事、竹球、細節對話與三種停留為創作改編。原作漁人後續離開並再尋桃源的情節，尚未製作。'),
e('h3','製作'),e('p','Wren｜企劃與作品方向。Codex｜互動敘事改編、程式與介面；OpenAI imagegen｜三張山水場景。歌曲沿用竹簡樂府既有〈桃花源記〉Suno 作品。本次試玩可自由開關聽曲。'),
e('p','版本 2026.10.15 · 第一回試玩','sheet-note'));
const link=e('a','回竹簡樂府聽曲');link.href='../';box.append(link);sheet('關於桃源行',box);
};
const song=$('song'),music=$('music');
function musicUI(){const playing=!song.paused;music.setAttribute('aria-pressed',String(playing));music.setAttribute('aria-label',playing?'暫停桃花源記歌曲':'播放桃花源記歌曲');$('music-label').textContent=playing?'停曲':'聽曲';}
music.onclick=async()=>{if(!song.paused){song.pause();return;}music.disabled=true;song.volume=.28;try{await song.play();}catch(_){toast('歌曲暫時無法播放，請稍後再點「聽曲」。');}finally{music.disabled=false;musicUI();}};
song.addEventListener('play',musicUI);song.addEventListener('pause',musicUI);
document.addEventListener('visibilitychange',()=>{if(document.hidden)song.pause();});
$('scene').addEventListener('error',()=>{toast('場景圖片載入失敗；故事仍可繼續，連線恢復後重新整理即可。');});
setTimeout(()=>{scenes.slice(1).forEach(s=>{const img=new Image();img.src='./assets/'+s.file+'.webp';});},1600);
})();
