import {useEffect,useRef,useState} from '../../vendor/hooks.module.js';
import {html,Button,Modal} from './components.js';
import {toastError} from './toasts.js';
import {t} from '../../../shared/i18n.js';

let loader;
export async function captureResult(node) {
 if(!globalThis.htmlToImage){loader ||= new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/vendor/html-to-image.js';script.onload=resolve;script.onerror=()=>{loader=null;reject(new Error(t('结算图片生成失败，请重试。')));};document.head.appendChild(script);
 });await loader;}
 await document.fonts?.ready;
 const blob=await globalThis.htmlToImage.toBlob(node,{pixelRatio:Math.min(2,globalThis.devicePixelRatio||1),backgroundColor:'#101715',width:node.clientWidth,height:node.clientHeight,filter:n=>!n.dataset?.shareExclude,skipAutoScale:false});
 if(!blob)throw new Error(t('结算图片生成失败，请重试。'));
 return blob;
}
export function ResultShare({target}) {
 const [busy,setBusy]=useState(false),[image,setImage]=useState(null),[url,setUrl]=useState(null);
 const live=useRef(true);
 useEffect(()=>()=>{live.current=false;},[]);
 useEffect(()=>{if(!image)return;const next=URL.createObjectURL(image);setUrl(next);return()=>URL.revokeObjectURL(next);},[image]);
 const generate=async()=>{if(busy)return;setBusy(true);try{const blob=await captureResult(target.current);if(live.current)setImage(blob);}catch(e){toastError(e);}finally{if(live.current)setBusy(false);}};
 const file=image?new File([image],`Stronghold-${Date.now()}.png`,{type:'image/png'}):null;
 const share=async()=>{try{await navigator.share({files:[file],title:t('本局战报')});}catch(e){if(e.name!=='AbortError')toastError(e);}};
 const save=()=>{const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();};
 const canShare=file&&navigator.canShare?.({files:[file]});
 return html`<div data-share-exclude="1"><${Button} disabled=${busy} onClick=${generate}>${busy?t('正在生成图片…'):t('保存与分享')}<//>
 <${Modal} open=${!!image} title=${t('本局战报')} onClose=${()=>setImage(null)} width="min(900px,94vw)"
 actions=${html`<${Button} onClick=${save} disabled=${!url}>${t('保存图片')}<//>${canShare?html`<${Button} onClick=${share}>${t('分享图片')}<//>`:null}`}>
 ${url?html`<img class="result-share-preview" src=${url} alt=${t('本局战报')} />`:null}
 <p>${t('可保存PNG图片；支持系统分享的浏览器可直接分享，也可长按图片保存。')}</p>
 <//></div>`;
}
