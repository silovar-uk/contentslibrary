if(!document.querySelector('link[href="/v09.css"]')){
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/v09.css';
  document.head.append(link);
}
