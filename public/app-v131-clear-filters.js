document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('[data-action="clear-filters"]')) return;
  const favorite = document.querySelector('#filterFavorite');
  const ratingExact = document.querySelector('#filterRatingExact');
  if (favorite) favorite.value = '';
  if (ratingExact) ratingExact.value = '';
}, true);
