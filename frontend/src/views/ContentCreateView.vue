<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useUiStore } from "../stores/ui";
import {
  audienceSuggestions,
  briefSteps,
  contentBriefDefaults,
  objectiveOptions,
  pillarOptions,
  productOptions,
  type ContentBriefMock,
} from "../data/contentBrief";
import AppIcon from "../components/ui/AppIcon.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseCard from "../components/ui/BaseCard.vue";
import BaseInput from "../components/ui/BaseInput.vue";
import BaseSelect from "../components/ui/BaseSelect.vue";
import BaseTextarea from "../components/ui/BaseTextarea.vue";
import InlineAlert from "../components/ui/InlineAlert.vue";
import StatusBadge from "../components/ui/StatusBadge.vue";
import Stepper from "../components/ui/Stepper.vue";

const ui = useUiStore();
const brief = reactive<ContentBriefMock>({ ...contentBriefDefaults });
const activeStep = ref("brief");
const isRefining = ref(false);
const isSaving = ref(false);
const savedAt = ref<string | null>(null);

const selectedProduct = computed(() =>
  productOptions.find((product) => product.value === brief.product),
);
const topicLength = computed(() => brief.topic.length);
const qualityScore = computed(() => {
  let score = 68;
  if (brief.audience.trim().length > 20) score += 8;
  if (brief.topic.trim().length > 12) score += 8;
  if (brief.thesis.trim().length > 70) score += 8;
  if (brief.constraints.trim().length > 40) score += 8;
  return Math.min(score, 100);
});
const selectedPillarLabel = computed(
  () =>
    pillarOptions.find((item) => item.value === brief.pillar)?.label ??
    "Educational",
);
const selectedObjectiveLabel = computed(
  () =>
    objectiveOptions.find((item) => item.value === brief.objective)?.label ??
    "Awareness",
);

function choosePillar(value: string) {
  brief.pillar = value;
}

function chooseObjective(value: string) {
  brief.objective = value;
}

function addAudience(suggestion: string) {
  const current = brief.audience.trim();
  if (!current.toLowerCase().includes(suggestion.toLowerCase())) {
    brief.audience = current ? `${current}, ${suggestion}` : suggestion;
  }
}

function autoRefine() {
  if (isRefining.value) return;
  isRefining.value = true;
  window.setTimeout(() => {
    brief.thesis =
      "Show how replacing paper approval chains with verifiable digital audit trails reduces cycle time, document loss, and compliance risk for public-sector teams.";
    isRefining.value = false;
    ui.notify("Thesis refined from the current brief.", "success");
  }, 450);
}

function saveDraft() {
  if (isSaving.value) return;
  isSaving.value = true;
  window.setTimeout(() => {
    savedAt.value = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
    isSaving.value = false;
    ui.notify("Brief saved as a local draft.", "success");
  }, 300);
}

function cancelBrief() {
  Object.assign(brief, contentBriefDefaults);
  savedAt.value = null;
  ui.notify("Draft changes reset to the starting brief.", "info");
}

function continueToGenerate() {
  saveDraft();
  window.setTimeout(() => {
    activeStep.value = "generate";
    ui.notify("Brief saved. Step 2 is ready for generation.", "info");
  }, 350);
}
</script>

<template>
  <div class="create-content-page">
    <header class="create-content-header">
      <div>
        <div class="app-breadcrumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <span>Content</span
              ><AppIcon name="chevron-right" :size="12" /><span>Create</span
              ><AppIcon name="chevron-right" :size="12" /><span
                aria-current="page"
                >Step 1</span
              >
            </li>
          </ol>
        </div>
        <div class="create-content-title-row">
          <div>
            <h1 class="page-header__title">Create Content</h1>
            <p class="page-header__description">
              Translate strategic brand foundations and verified product
              knowledge into precision AI prompts.
            </p>
          </div>
          <StatusBadge tone="info" dot
            ><AppIcon name="system" :size="14" /> Context Engine: Local mock
            context</StatusBadge
          >
        </div>
      </div>
    </header>

    <Stepper
      :steps="
        briefSteps.map((step) => ({
          ...step,
          disabled: step.id !== 'brief' && activeStep === 'brief',
        }))
      "
      :current="activeStep"
      label="Content creation workflow"
    />

    <div v-if="activeStep === 'generate'" class="generate-placeholder">
      <BaseCard
        title="Generate"
        description="Step 2 is ready for the next phase of the workflow."
      >
        <InlineAlert title="Brief saved locally" tone="success"
          >The brief is complete enough to begin generating mock content
          candidates. Generation remains a placeholder in this
          phase.</InlineAlert
        >
        <div class="generate-placeholder__summary">
          <div>
            <span class="brief-overline">Topic</span
            ><strong>{{ brief.topic }}</strong>
          </div>
          <div>
            <span class="brief-overline">Strategy</span
            ><strong
              >{{ selectedPillarLabel }} · {{ selectedObjectiveLabel }}</strong
            >
          </div>
          <div>
            <span class="brief-overline">Context</span
            ><strong>{{ selectedProduct?.label ?? "Company context" }}</strong>
          </div>
        </div>
        <template #footer
          ><BaseButton variant="secondary" @click="activeStep = 'brief'"
            ><AppIcon name="arrow-left" :size="16" />Back to Brief</BaseButton
          ></template
        >
      </BaseCard>
    </div>

    <div v-else class="brief-workbench">
      <section class="brief-form-panel">
        <BaseCard>
          <div class="brief-form-stack">
            <div class="brief-form-grid">
              <div class="brief-field-group">
                <div class="brief-field-heading">
                  <span class="brief-overline">Content Context</span
                  ><span
                    class="brief-help"
                    title="Choose whether this brief is grounded in company or product context"
                    ><AppIcon name="info" :size="14" /> Context scope</span
                  >
                </div>
                <div
                  class="segmented-control"
                  role="radiogroup"
                  aria-label="Content context"
                >
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="brief.context === 'company'"
                    :class="{ 'is-selected': brief.context === 'company' }"
                    @click="brief.context = 'company'"
                  >
                    Company
                  </button>
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="brief.context === 'product'"
                    :class="{ 'is-selected': brief.context === 'product' }"
                    @click="brief.context = 'product'"
                  >
                    Product
                  </button>
                </div>
              </div>
              <div class="brief-field-group">
                <div class="brief-field-heading">
                  <span class="brief-overline">Product Asset Link</span
                  ><StatusBadge
                    :tone="brief.context === 'product' ? 'success' : 'info'"
                    dot
                    >{{
                      brief.context === 'product'
                        ? 'Context active'
                        : 'Company context'
                    }}</StatusBadge
                  >
                </div>
                <BaseSelect
                  v-model="brief.product"
                  label="Product asset"
                  :options="productOptions"
                  :disabled="brief.context === 'company'"
                  class="brief-compact-field"
                />
              </div>
            </div>

            <fieldset class="brief-field-group brief-fieldset">
              <legend class="brief-field-heading">
                <span class="brief-overline">Content Pillar</span
                ><span class="brief-help">Select a core narrative angle</span>
              </legend>
              <div
                class="choice-chip-grid"
                role="radiogroup"
                aria-label="Content pillar"
              >
                <button
                  v-for="item in pillarOptions"
                  :key="item.value"
                  type="button"
                  role="radio"
                  :aria-checked="brief.pillar === item.value"
                  class="choice-chip"
                  :class="{ 'is-selected': brief.pillar === item.value }"
                  @click="choosePillar(item.value)"
                >
                  <AppIcon :name="item.icon" :size="16" /><span>{{
                    item.label
                  }}</span
                  ><span
                    v-if="brief.pillar === item.value"
                    class="choice-chip__dot"
                  />
                </button>
              </div>
            </fieldset>

            <fieldset class="brief-field-group brief-fieldset">
              <legend class="brief-field-heading">
                <span class="brief-overline">Strategic Objective</span
                ><span class="brief-help">Target conversion funnel tier</span>
              </legend>
              <div
                class="objective-grid"
                role="radiogroup"
                aria-label="Strategic objective"
              >
                <button
                  v-for="item in objectiveOptions"
                  :key="item.value"
                  type="button"
                  role="radio"
                  :aria-checked="brief.objective === item.value"
                  class="objective-choice"
                  :class="{ 'is-selected': brief.objective === item.value }"
                  @click="chooseObjective(item.value)"
                >
                  <AppIcon :name="item.icon" :size="18" /><span>{{
                    item.label
                  }}</span>
                </button>
              </div>
            </fieldset>

            <div class="brief-field-group">
              <div class="brief-field-heading">
                <span class="brief-overline">Target Audience</span
                ><button
                  type="button"
                  class="brief-text-action"
                  @click="
                    ui.notify(
                      'Persona browsing will be available with the context engine.',
                      'info',
                    )
                  "
                >
                  Browse Persona Matrix
                </button>
              </div>
              <BaseInput
                v-model="brief.audience"
                label="Target audience"
                aria-label="Target audience"
              />
              <div class="quick-add-row">
                <span class="brief-overline">Quick Add:</span
                ><button
                  v-for="suggestion in audienceSuggestions"
                  :key="suggestion"
                  type="button"
                  class="quick-add-chip"
                  @click="addAudience(suggestion)"
                >
                  + {{ suggestion }}
                </button>
              </div>
            </div>

            <BaseInput
              v-model="brief.topic"
              label="Topic / Primary Narrative"
              :hint="`${topicLength} characters`"
              class="brief-large-input"
            />

            <div class="brief-field-group">
              <div class="brief-field-heading">
                <span class="brief-overline">Content Angle &amp; Thesis</span
                ><button
                  type="button"
                  class="brief-text-action"
                  :disabled="isRefining"
                  @click="autoRefine"
                >
                  <AppIcon name="sparkles" :size="14" />{{
                    isRefining ? "Refining…" : "Auto-Refine Thesis"
                  }}
                </button>
              </div>
              <BaseTextarea
                v-model="brief.thesis"
                label="Content angle and thesis"
                :rows="4"
              />
            </div>

            <div class="brief-field-group">
              <div class="brief-field-heading">
                <span class="brief-overline"
                  >Execution Constraints &amp; Style Tone</span
                ><span class="brief-help">Negative prompt guardrails</span>
              </div>
              <BaseTextarea
                v-model="brief.constraints"
                label="Execution constraints and style tone"
                :rows="3"
              />
            </div>
          </div>
        </BaseCard>

        <div class="brief-action-bar">
          <div class="brief-action-left">
            <BaseButton variant="ghost" @click="cancelBrief">Cancel</BaseButton
            ><BaseButton
              variant="secondary"
              :loading="isSaving"
              @click="saveDraft"
              ><AppIcon name="library" :size="17" />Save as Draft</BaseButton
            ><span v-if="savedAt" class="save-status"
              >Saved locally at {{ savedAt }}</span
            >
          </div>
          <div class="brief-action-right">
            <span class="token-estimate">Est. tokens: <strong>650</strong></span
            ><BaseButton size="comfortable" @click="continueToGenerate"
              >Generate Content <AppIcon name="sparkles" :size="18"
            /></BaseButton>
          </div>
        </div>
      </section>

      <aside class="brief-inspector" aria-label="Brief context inspector">
        <BaseCard title="Context Anchor">
          <template #actions
            ><StatusBadge tone="success" dot>Synced</StatusBadge></template
          >
          <div class="context-visual">
            <div><span>SHIFD APPROVAL V4.2 CORE</span></div>
          </div>
          <dl class="context-details">
            <div>
              <dt>Category</dt>
              <dd>GovTech / Enterprise SaaS</dd>
            </div>
            <div>
              <dt>Key feature set</dt>
              <dd>Cryptographic sign-off, multi-tier audit</dd>
            </div>
            <div>
              <dt>Audience match</dt>
              <dd class="text-success">98.4% confidence</dd>
            </div>
          </dl>
          <div class="context-suggestion">
            <AppIcon name="idea" :size="18" />
            <p>
              Mention the <strong>32% cycle time reduction</strong> verified
              from the Ministry of Public Works case study for increased
              conversion.
            </p>
          </div>
        </BaseCard>

        <BaseCard title="Brief Quality Score">
          <template #actions
            ><span class="quality-score"
              >{{ qualityScore }}<small>/100</small></span
            ></template
          >
          <div class="quality-list">
            <div>
              <div>
                <span>Audience precision</span
                ><strong>{{
                  brief.audience.length > 20 ? "Optimal" : "Needs detail"
                }}</strong>
              </div>
              <progress
                :value="brief.audience.length > 20 ? 95 : 48"
                max="100"
              />
            </div>
            <div>
              <div>
                <span>Narrative tension (angle)</span
                ><strong>{{
                  brief.thesis.length > 70 ? "Strong" : "Developing"
                }}</strong>
              </div>
              <progress :value="brief.thesis.length > 70 ? 90 : 52" max="100" />
            </div>
            <div>
              <div>
                <span>Tone guardrails</span
                ><strong>{{
                  brief.constraints.length > 40
                    ? "Well-defined"
                    : "Add guardrails"
                }}</strong>
              </div>
              <progress
                class="is-success"
                :value="brief.constraints.length > 40 ? 92 : 48"
                max="100"
              />
            </div>
          </div>
          <div class="engine-ready">
            <StatusBadge tone="success" dot>Ready for generation</StatusBadge
            ><span>Mock engine</span>
          </div>
        </BaseCard>

        <BaseCard title="Recent Product Angles">
          <div class="recent-angle-list">
            <button
              type="button"
              @click="brief.topic = 'Zero Trust Audit Trail in Government'"
            >
              <strong>Zero Trust Audit Trail in Government</strong
              ><span>Used 2 days ago · 4,200 reads</span></button
            ><button
              type="button"
              @click="brief.topic = 'Cost of Physical Couriers vs Secure Cloud'"
            >
              <strong>Cost of Physical Couriers vs Secure Cloud</strong
              ><span>Used 5 days ago · 1,840 reads</span>
            </button>
          </div>
        </BaseCard>
      </aside>
    </div>
  </div>
</template>
