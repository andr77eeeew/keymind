<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import { localDate } from "../stats/trends";
import { brainNext } from "../typing/api";
import AppShell from "../components/AppShell.vue";
import SegControl from "../components/SegControl.vue";
import { useAppStore } from "../stores/app";
import { useSessionStore } from "../stores/session";
import {
  importLine,
  isFinished,
  passageLine,
  readPercent,
  wordsLine,
} from "../typing/remembered";
import type { Mode } from "../typing/types";

const app = useAppStore();
const session = useSessionStore();

const rail: { mode: Mode; label: string }[] = [
  { mode: "adaptive", label: "Adaptive" },
  { mode: "words", label: "Words" },
  { mode: "texts", label: "Texts" },
  { mode: "zen", label: "Zen" },
];
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
  label: value.toLocaleString("en"),
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
const PANELS: Record<Mode, { title: string; text: string }> = {
  adaptive: {
    title: "Adaptive",
    text: "Sessions built from your weak keys. The brain picks everything, so there is nothing to set up.",
  },
  test: {
    title: "Starting test",
    text: "One minute of natural text that draws your first map.",
  },
  words: {
    title: "Words",
    text: "Common English words in random order.",
  },
  texts: { title: "Texts", text: "Books, your own words or your own files." },
  zen: {
    title: "Zen",
    text: "Type anything. There is no text to follow, and no figures on the screen.",
  },
};

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const primary = useTemplateRef<HTMLButtonElement>("primary");
const pasteArea = useTemplateRef<HTMLTextAreaElement>("pasteArea");
const keep = useTemplateRef<HTMLButtonElement[]>("keep");
/** The file whose row is asking to confirm a delete. */
const confirming = ref<string | null>(null);

const panel = computed(() => PANELS[session.mode]);
/** The key the next adaptive session works on, or null while unknown. */
const nextFocus = ref<string | null>(null);

/** What the foot says, and whether Start can run. A reason takes the place of the summary. */
const foot = computed<{ sum: string; why?: string; label?: string }>(() => {
  switch (session.mode) {
    case "words":
      return {
        sum:
          session.wordsBy === "count"
            ? wordsLine(session.pool, session.wordCount)
            : wordsLine(session.pool, undefined, session.wordSeconds),
      };
    case "zen":
      return { sum: "Free typing, for as long as you like" };
    case "adaptive":
      return { sum: "A session of about three minutes" };
    case "test":
      return { sum: "", why: "The starting test opens from Home." };
    case "texts":
      break;
  }
  if (session.textSource === "passage") {
    return { sum: passageLine(session.difficulty) };
  }
  if (session.textSource === "paste") {
    const check = session.pasteCheck;
    if (session.pasted.trim() === "") {
      return { sum: "", why: "Paste a text to start." };
    }
    if (check !== null && check.chars === 0) {
      return { sum: "", why: "Add English text to start." };
    }
    return {
      sum: check
        ? `Your text, ${check.chars.toLocaleString("en")} characters`
        : "Your text",
    };
  }
  if (session.libraryState === "loading") {
    return { sum: "", why: "Reading your library." };
  }
  if (session.libraryState === "error") {
    return { sum: "", why: "Choose a file to start." };
  }
  const item = session.selectedImport;
  if (item === null) {
    return { sum: "", why: "Add a file to start." };
  }
  return isFinished(item)
    ? {
        sum: `You reached the end of ${item.title}. It starts again from the beginning.`,
        label: "Start again",
      }
    : { sum: importLine(item) };
});

const primaryLabel = computed(() => {
  if (session.startError) {
    return "Try again";
  }
  return foot.value.label ?? "Start session";
});

const pasteInvalid = computed(
  () => session.pasteCheck !== null && session.pasteCheck.chars === 0,
);

let pasteTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => session.pasted,
  () => {
    if (pasteTimer !== null) {
      clearTimeout(pasteTimer);
    }
    // Waits for a pause, so a long text is not cleaned on every key.
    pasteTimer = setTimeout(() => void session.checkPaste(), 200);
  },
);

// A choice that changes what will start clears the failure of the previous one.
watch(
  () => [session.mode, session.textSource, session.difficulty, session.pool],
  () => {
    session.startError = null;
  },
);

onMounted(() => {
  // Only a sentence depends on it, so a failure simply leaves the sentence out.
  brainNext(localDate(new Date()))
    .then((choice) => {
      nextFocus.value = choice.focus;
    })
    .catch(() => {
      nextFocus.value = null;
    });
  void session.refreshImports();
  void session.checkPaste();
  // Arriving to paste puts the cursor in the field. Otherwise Enter starts, as on Home.
  if (session.mode === "texts" && session.textSource === "paste") {
    pasteArea.value?.focus();
  } else if (foot.value.why === undefined) {
    primary.value?.focus();
  }
});

function onFiles(event: Event): void {
  const input = event.target as HTMLInputElement;
  void session.addImports([...(input.files ?? [])]);
  // Lets the same file be chosen again after it was deleted.
  input.value = "";
}

function askDelete(id: string): void {
  confirming.value = id;
  // Keep has the focus, so a stray Enter or Space never deletes a book.
  void nextTick(() => keep.value?.[0]?.focus());
}

function confirmDelete(id: string): void {
  confirming.value = null;
  void session.removeImport(id);
}
</script>

<template>
  <AppShell>
    <div class="page-head page-head--setup">
      <h1>Set up a session</h1>
      <a class="link" href="#" @click.prevent="app.go('home')">Back to home</a>
    </div>
    <div class="setup">
      <nav class="rail" aria-label="Modes">
        <a
          v-for="item in rail"
          :key="item.mode"
          class="rail__i"
          href="#"
          :aria-current="session.mode === item.mode ? 'page' : undefined"
          @click.prevent="session.mode = item.mode"
          >{{ item.label }}</a
        >
      </nav>
      <section class="setup__p">
        <header class="setup__h">
          <h2>{{ panel.title }}</h2>
          <p>{{ panel.text }}</p>
        </header>
        <div class="setup__b">
          <p v-if="session.mode === 'adaptive'" class="setup__none">
            <template v-if="nextFocus"
              >The next session works on <b class="gram">{{ nextFocus }}</b
              >.
            </template>
            Home starts it with one action, and this screen is only a second way
            in.
          </p>
          <template v-if="session.mode === 'words'">
            <div class="setting">
              <div>
                <p class="setting__t">Length</p>
                <p v-if="session.wordsBy === 'time'" class="setting__d">
                  The clock starts with your first key.
                </p>
              </div>
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
                <p class="setting__t">Word set</p>
                <p class="setting__d">
                  Draws from the most common English words.
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
                ref="pasteArea"
                v-model="session.pasted"
                class="input paste__area"
                rows="5"
                spellcheck="false"
                placeholder="Paste or type a text here"
                :aria-invalid="pasteInvalid ? 'true' : undefined"
                :aria-describedby="pasteInvalid ? 'pasted-e' : undefined"
              />
              <p v-if="pasteInvalid" id="pasted-e" class="field__error">
                Nothing here can be typed on the English layout, the only one
                available for now.
              </p>
              <p v-else-if="session.pasteCheck?.removed" class="field__help">
                {{ session.pasteCheck.removed.toLocaleString("en") }}
                characters have no key on the English layout and will be left
                out.
              </p>
              <p v-else class="field__help">
                It stays on this computer. Characters with no key on the layout
                are left out.
              </p>
            </div>

            <div v-if="session.textSource === 'import'" class="lib__wrap">
              <div v-if="session.libraryState === 'loading'" aria-busy="true">
                <span class="visually-hidden">Loading</span>
                <div class="sk">
                  <i style="--w: 92%" />
                  <i style="--w: 74%" />
                  <i style="--w: 84%" />
                </div>
              </div>
              <div
                v-else-if="session.libraryState === 'error'"
                class="state state--error"
              >
                <p class="state__h">Your library could not be read</p>
                <p>
                  Your files are still in the data folder. Passages and pasted
                  text work as usual.
                </p>
                <div class="state__a">
                  <button
                    class="btn"
                    type="button"
                    @click="session.refreshImports()"
                  >
                    Try again
                  </button>
                </div>
              </div>
              <template v-else>
                <div
                  v-if="
                    session.imports.length === 0 &&
                    session.importing.length === 0 &&
                    session.failedImports.length === 0
                  "
                  class="state"
                >
                  <p class="state__h">No files yet</p>
                  <p>
                    Add a TXT or EPUB file. A session continues where the last
                    one stopped.
                  </p>
                </div>
                <ul v-else class="lib">
                  <li
                    v-for="name in session.importing"
                    :key="name"
                    class="lib__r is-importing"
                  >
                    <span class="lib__t lib__t--wide" :title="name">{{
                      name
                    }}</span>
                    <div class="lib__busy">
                      <div
                        class="busy"
                        role="progressbar"
                        :aria-label="`Importing ${name}`"
                      >
                        <i />
                      </div>
                      <p class="field__help" role="status">
                        Reading the file. A long book takes a moment, and you
                        can start a session meanwhile.
                      </p>
                    </div>
                  </li>
                  <li
                    v-for="failure in session.failedImports"
                    :key="failure.id"
                    class="lib__r is-error"
                  >
                    <span class="lib__t lib__t--wide" :title="failure.name">{{
                      failure.name
                    }}</span>
                    <div class="state state--error lib__fail">
                      <p class="state__h">{{ failure.head }}</p>
                      <p>{{ failure.text }}</p>
                    </div>
                    <button
                      type="button"
                      class="btn btn--quiet btn--sm"
                      @click="session.dismissFailure(failure.id)"
                    >
                      Dismiss
                    </button>
                  </li>
                  <template v-for="item in session.imports" :key="item.id">
                    <li v-if="confirming === item.id" class="lib__r is-confirm">
                      <span class="lib__t lib__t--wide" :title="item.title">{{
                        item.title
                      }}</span>
                      <div
                        class="lib__ask"
                        role="group"
                        aria-label="Confirm delete"
                      >
                        <p>
                          Delete this file and its reading position? Your typing
                          history stays in the journal.
                        </p>
                        <div class="row">
                          <button
                            type="button"
                            class="btn btn--sm"
                            @click="confirmDelete(item.id)"
                          >
                            Delete
                          </button>
                          <button
                            ref="keep"
                            type="button"
                            class="btn btn--quiet btn--sm"
                            @click="confirming = null"
                          >
                            Keep
                          </button>
                        </div>
                      </div>
                    </li>
                    <li v-else class="lib__r">
                      <label class="lib__pick">
                        <input
                          v-model="session.importId"
                          type="radio"
                          name="lib"
                          :value="item.id"
                        />
                        <span class="lib__t" :title="item.title">{{
                          item.title
                        }}</span>
                      </label>
                      <span class="lib__c"
                        >{{ item.chars.toLocaleString("en") }} characters</span
                      >
                      <span class="lib__read">
                        <span v-if="isFinished(item)" class="tag tag--strong"
                          >Finished</span
                        >
                        <template v-else>
                          <b>{{ readPercent(item.offset, item.chars) }}%</b>
                          read
                        </template>
                      </span>
                      <button
                        type="button"
                        class="btn btn--quiet btn--sm"
                        :aria-label="`Delete ${item.title}`"
                        @click="askDelete(item.id)"
                      >
                        Delete
                      </button>
                      <p v-if="session.importNotes[item.id]" class="lib__note">
                        {{ session.importNotes[item.id] }}
                      </p>
                    </li>
                  </template>
                </ul>
                <p v-if="session.importError" class="field__error" role="alert">
                  {{ session.importError }}
                </p>
                <div class="lib__add">
                  <button type="button" class="btn" @click="fileInput?.click()">
                    Add a file
                  </button>
                  <input
                    ref="fileInput"
                    class="visually-hidden"
                    type="file"
                    tabindex="-1"
                    aria-hidden="true"
                    multiple
                    accept=".txt,.epub"
                    @change="onFiles"
                  />
                  <p class="field__help">
                    {{
                      session.importing.length > 0
                        ? "Another file can wait for this one."
                        : "TXT or EPUB, up to 128 MB. It stays on this computer."
                    }}
                  </p>
                </div>
              </template>
            </div>
          </template>

          <p v-if="session.mode === 'zen'" class="setup__none">
            Zen has nothing to set up. Backspace always works here.
          </p>

          <p v-if="session.startError" class="field__error" role="alert">
            {{ session.startError }}
          </p>
        </div>
        <div class="setup__foot">
          <p
            class="setup__sum"
            :role="foot.why ? 'status' : undefined"
            :title="foot.sum"
          >
            {{ foot.why ?? foot.sum }}
          </p>
          <button
            ref="primary"
            type="button"
            class="btn btn--primary"
            :disabled="foot.why !== undefined || session.starting"
            @click="session.start()"
          >
            {{ primaryLabel }}
          </button>
        </div>
      </section>
    </div>
  </AppShell>
</template>
