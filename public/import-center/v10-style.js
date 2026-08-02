if(!document.querySelector('link[href="/v10.css"]')){
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/v10.css';
  document.head.append(link);
}
