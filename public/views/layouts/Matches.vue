<template>
  <div>
    <b-container class="primary mt-4 p-0 pt-1">
      <unmatched-albums-card-deck />
    </b-container>

    <b-container class="primary mt-4 p-0 pt-1">
      <matched-albums-table />
    </b-container>

  </div>
</template>

<script>

import UnmatchedAlbumsCardDeck from '@/components/UnmatchedAlbumsCardDeck';
import MatchedAlbumsTable from '@/components/MatchedAlbumsTable';

export default {
  name: 'Matches',
  components: {
    'unmatched-albums-card-deck': UnmatchedAlbumsCardDeck,
    'matched-albums-table': MatchedAlbumsTable,
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

</style>
