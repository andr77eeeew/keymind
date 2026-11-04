<script setup lang="ts">
import { onMounted } from "vue";
import AppShell from "../components/AppShell.vue";
import SegControl from "../components/SegControl.vue";
import { useSessionStore } from "../stores/session";

const session = useSessionStore();

const modes = [
  { value: "words", label: "Words" },
  { value: "texts", label: "Texts" },
  { value: "zen", label: "Zen" },
] as const;
const wordsBy = [
  { value: "count", label: "By count" },
  { value: "time", label: "By time" },
] as const;
const counts = [10, 25, 50, 100].map((value) => ({
  value,
  label: String(value),
}));
const seconds = [15, 30, 60, 120].map((value) => ({
  value,
  label: `${value} s`,
}));
const pools = [200, 1000, 5000].map((value) => ({
  value,
  label: String(value),
}));
const sources = [
  { value: "passage", label: "Passages" },
  { value: "paste", label: "Paste" },
  { value: "import", label: "File" },
] as const;
const difficulties = [
  { value: null, label: "Any" },
  { value: 1, label: "Easy" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Hard" },
];

onMounted(() => {
  void session.refreshImports();
});

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    void session.addImport(file);
  }
  // Lets the same file be chosen again after it was deleted.
  input.value = "";
}

function progress(offset: number, chars: number): string {
  return chars === 0 ? "0%" : `${Math.floor((offset / chars) * 100)}%`;
}
</script>

<template>
  <AppShell>
    <div class="page-head">
      <h1>Start a session</h1>
    </div>

    <section class="sheet setup">
      <div class="setting setting--first">
        <div>
          <p class="setting__t">Mode</p>
          <p v-if="session.mode === 'zen'" class="setting__d">
            Type anything, with no text to follow and no figures on the screen.
          </p>
        </div>
        <div class="setting__c">
          <SegControl v-model="session.mode" label="Mode" :options="modes" />
        </div>
      </div>

      <template v-if="session.mode === 'words'">
        <div class="setting">
          <div><p class="setting__t">Length</p></div>
          <div class="setting__c">
            <SegControl
              v-model="session.wordsBy"
              label="Length by"
              :options="wordsBy"
            />
            <SegControl
              v-if="session.wordsBy === 'count'"
              v-model="session.wordCount"
              label="Number of words"
              :options="counts"
            />
            <SegControl
              v-else
              v-model="session.wordSeconds"
              label="Time limit"
              :options="seconds"
            />
          </div>
        </div>
        <div class="setting">
          <div>
            <p class="setting__t">Words</p>
            <p class="setting__d">
              How many of the most common English words to draw from.
            </p>
          </div>
          <div class="setting__c">
            <SegControl
              v-model="session.pool"
              label="Word pool"
              :options="pools"
            />
          </div>
        </div>
      </template>

      <template v-if="session.mode === 'texts'">
        <div class="setting">
          <div><p class="setting__t">Text</p></div>
          <div class="setting__c">
            <SegControl
              v-model="session.textSource"
              label="Text source"
              :options="sources"
            />
          </div>
        </div>

        <div v-if="session.textSource === 'passage'" class="setting">
          <div>
            <p class="setting__t">Difficulty</p>
            <p class="setting__d">Passages from public-domain books.</p>
          </div>
          <div class="setting__c">
            <SegControl
              v-model="session.difficulty"
              label="Difficulty"
              :options="difficulties"
            />
          </div>
        </div>

        <div v-if="session.textSource === 'paste'" class="field paste">
          <label for="pasted">Your text</label>
          <textarea
            id="pasted"
            v-model="session.pasted"
            class="input paste__area"
            rows="6"
            spellcheck="false"
          />
          <p class="field__help">
            It stays on this computer. Characters with no key on the layout are
            left out.
          </p>
        </div>

        <div v-if="session.textSource === 'import'" class="library">
          <table v-if="session.imports.length > 0" class="tbl">
            <thead>
              <tr>
                <th>File</th>
                <th class="n">Read</th>
                <th><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in session.imports" :key="item.id">
                <td>
                  <label class="library__pick">
                    <input
                      v-model="session.importId"
                      type="radio"
                      name="import"
                      :value="item.id"
                    />
                    {{ item.title }}
                  </label>
                </td>
                <td class="n">{{ progress(item.offset, item.chars) }}</td>
                <td class="library__a">
                  <button
                    type="button"
                    class="btn btn--quiet btn--sm"
                    @click="session.removeImport(item.id)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="state">
            <p class="state__h">No files yet</p>
            <p>
              Add a TXT or EPUB file. It stays on this computer, and a session
              continues where the last one stopped.
            </p>
          </div>
          <div class="row">
            <label class="btn">
              Add a file
              <input
                class="visually-hidden"
                type="file"
                accept=".txt,.epub"
                @change="onFile"
              />
            </label>
            <p v-if="session.importNote" class="field__help" role="status">
              {{ session.importNote }}
            </p>
          </div>
          <p v-if="session.importError" class="field__error" role="alert">
            {{ session.importError }}
          </p>
        </div>
      </template>

      <p v-if="session.startError" class="field__error" role="alert">
        {{ session.startError }}
      </p>
      <div class="setup__a">
        <button
          type="button"
          class="btn btn--primary"
          :disabled="session.starting"
          @click="session.start()"
        >
          Start session
        </button>
      </div>
    </section>
  </AppShell>
</template>
