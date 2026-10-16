<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import { useUiStore } from "../stores/ui";
import {
  audienceSuggestions,
  briefSteps,
  objectiveOptions,
  pillarOptions,
} from "../constants/contentOptions";
import AppIcon from "../components/ui/AppIcon.vue";
import PageHeaderHelp from "../components/app/PageHeaderHelp.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseCard from "../components/ui/BaseCard.vue";
import BaseCheckbox from "../components/ui/BaseCheckbox.vue";
import BaseInput from "../components/ui/BaseInput.vue";
import BaseModal from "../components/ui/BaseModal.vue";
import BaseSelect from "../components/ui/BaseSelect.vue";
import BaseTextarea from "../components/ui/BaseTextarea.vue";
import InfoTooltip from "../components/ui/InfoTooltip.vue";
import InlineAlert from "../components/ui/InlineAlert.vue";
import StatusBadge from "../components/ui/StatusBadge.vue";
import { useContentWorkflowStore } from "../stores/contentWorkflow";
import { useContentIdeasStore } from "../stores/contentIdeas";
import { useCompanyContextStore } from "../stores/companyContext";
import { useProductsStore } from "../stores/products";
import type { ContentIdea } from "../types/contentIdea";
import { useRouter } from "vue-router";
import ContentWorkflowStepper from "../components/content/ContentWorkflowStepper.vue";
import CanvaDesignLinkPanel from "../components/content/CanvaDesignLinkPanel.vue";
import CanvaReadyComposer from "../components/content/CanvaReadyComposer.vue";
import CreativeThumbnail from "../components/content/CreativeThumbnail.vue";
import BrandAssessmentCard from "../components/content/BrandAssessmentCard.vue";
import VisualDirectionCard from "../components/content/VisualDirectionCard.vue";
import { isBriefReady as isBriefReadyValue } from "../utils/contentValidation";
import * as creativeReferenceApi from "../api/creativeReferences";
import * as schedulingApi from "../api/scheduling";
import { createRequestKey, errorMessage, isApiError } from "../api/client";
import type { BackendCreativeReference, BackendCreativeReferenceBatch, CreativeReferenceAspectRatio, CreativeReferenceFact, CreativeReferenceFormat, CreativeReferenceGenerationMode, CreativeReferenceMood, CreativeReferencePlatform, CreativeReferenceStyle } from "../types/backend";

const ui = useUiStore();
const router = useRouter();
const pageHelp = {
  purpose: 'Create platform-ready marketing content through a guided workflow, from brief to publication plan.',
  steps: ['Complete the brief and choose the audience, objective, and platforms.', 'Generate and review copy and creative; make edits and complete the human review.', 'Approve the content, then set a publication schedule or return to the library.'],
}
const workflow = useContentWorkflowStore();
const ideas = useContentIdeasStore();
const companyContext = useCompanyContextStore();
const productsStore = useProductsStore();
const brief = workflow.brief;
const activeStep = toRef(workflow, "activeStep");
const isSaving = ref(false);
const savedAt = ref<string | null>(null);
const isEditingDraft = ref(false);
const generatedContent = workflow.generatedContent;
const visualDirection = workflow.visualDirection;
const enabledPlatforms = workflow.enabledPlatforms;
const isEditingInstagram = ref(false);
const isEditingLinkedIn = ref(false);
const designStatus = toRef(workflow, "designStatus");
const reuseInstagramCreative = toRef(workflow, "reuseInstagramCreative");
const instagramAssets = toRef(workflow, "instagramAssets");
const linkedInAssets = toRef(workflow, "linkedInAssets");
const creativeValidation = ref("");
const draggedInstagramAssetId = ref<string | null>(null);
const draggedLinkedInAssetId = ref<string | null>(null);
const isApproved = toRef(workflow, "isApproved");
const approvedBy = toRef(workflow, "approvedBy");
const approvedAt = toRef(workflow, "approvedAt");
const reviewValidation = ref("");
const reviewRecheckLoading = ref(false);
const contentBusy = computed(() => workflow.loading || reviewRecheckLoading.value);
const reviewChecklist = workflow.reviewChecklist;
const reviewEditing = workflow.reviewEditing;
const reviewAssessments = workflow.reviewAssessments;
const reviewOverrides = workflow.reviewOverrides;
const overrideModalOpen = ref(false);
const overridePlatform = ref<"instagram" | "linkedin">("instagram");
const overrideJustification = ref("");
const overrideError = ref("");
const isScheduled = toRef(workflow, "isScheduled");
const scheduleValidation = ref("");
const publicationTimeRecommendations = ref<schedulingApi.PublicationTimeRecommendation[]>([]);
const publicationRecommendationsLoading = ref(false);
const publicationRecommendationsError = ref("");
const creativeReferenceBatches = ref<BackendCreativeReferenceBatch[]>([]);
const creativeReferencePlatform = ref<CreativeReferencePlatform>("instagram");
const creativeReferenceFormat = ref<CreativeReferenceFormat>("single_image");
const creativeReferenceGenerationMode = ref<CreativeReferenceGenerationMode>("original_design");
const creativeReferenceSlideCount = ref("5");
const creativeReferenceStyle = ref<CreativeReferenceStyle>("modern_minimal");
const creativeReferenceMood = ref<CreativeReferenceMood>("professional");
const creativeReferenceAspectRatio = ref<CreativeReferenceAspectRatio>("portrait_4_5");
const creativeReferenceInstruction = ref("");
const creativeReferenceFacts = ref<CreativeReferenceFact[]>([]);
const creativeReferenceFactConcern = ref("");
const selectedCreativeReferenceFactIds = ref<string[]>([]);
const creativeReferenceFactsLoading = ref(false);
const creativeReferenceFactsError = ref("");
const creativeReferenceLoading = ref(false);
const creativeReferenceError = ref("");
const creativeReferenceAbortController = ref<AbortController | null>(null);
// Stay safely disabled until the backend reports that its configured model
// supports transparent image output.
const canvaReadyUnavailable = ref(true);
const selectedCreativeReferenceId = ref<string | null>(null);
const useSameSchedule = toRef(workflow, "useSameSchedule");
const instagramSchedule = workflow.instagramSchedule;
const linkedInSchedule = workflow.linkedInSchedule;
const scheduledRecords = workflow.scheduledRecords;
const instagramContent = workflow.instagramContent;
const linkedInContent = workflow.linkedInContent;
const ARTIFACT_TIMEZONE = "Asia/Jakarta";
const productOptions = computed(() => productsStore.productOptions);
let loadingLockActive = false;
let previousBodyOverflow = "";
let previousAppShellInert = false;

function syncLoadingLock(loading: boolean) {
  const appShell = document.querySelector<HTMLElement>(".app-shell");
  if (loading && !loadingLockActive) {
    previousBodyOverflow = document.body.style.overflow;
    previousAppShellInert = appShell?.inert ?? false;
    loadingLockActive = true;
  }
  if (loadingLockActive) {
    document.body.style.overflow = loading ? "hidden" : previousBodyOverflow;
    if (appShell) appShell.inert = loading ? true : previousAppShellInert;
  }
  if (!loading) loadingLockActive = false;
}

watch(contentBusy, syncLoadingLock);
watch(() => workflow.contentId, () => {
  publicationTimeRecommendations.value = [];
  publicationRecommendationsError.value = "";
});

onBeforeUnmount(() => {
  creativeReferenceAbortController.value?.abort();
  if (loadingLockActive) syncLoadingLock(false);
});

const selectedProduct = computed(() =>
  productsStore.getProduct(brief.product),
);
const topicLength = computed(() => brief.topic.length);
const selectedProductName = computed(
  () => selectedProduct.value?.name ?? "No product selected",
);
const resolvedProductContext = computed(() => brief.context === "product" ? productsStore.resolveProductContext(brief.product) : undefined);
const activeContextAudience = computed(() =>
  brief.context === "general"
    ? brief.audience || "Not set"
    : resolvedProductContext.value?.profile.targetUsers.length
    ? resolvedProductContext.value.profile.targetUsers.join(", ")
    : brief.context === "company" && companyContext.companyProfile.customerSegments.length
      ? companyContext.companyProfile.customerSegments.join(", ")
      : brief.audience || "Not set",
);
const activeContextValue = computed(() => brief.context === "general" ? "" : resolvedProductContext.value?.profile.valueProposition || (brief.context === "company" ? companyContext.companyProfile.coreValueProposition : ""));
const activeBrandVoice = computed(() => brief.context === "general" ? "Neutral, topic-led voice" : resolvedProductContext.value?.resolvedBrandVoice || companyContext.brandProfile.brandVoice);
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
const briefReadinessItems = computed(() => [
  { label: "Context", complete: Boolean(brief.context) },
  {
    label: "Product",
    complete: brief.context !== "product" || Boolean(brief.product),
    optional: brief.context !== "product",
  },
  { label: "Content Pillar", complete: Boolean(brief.pillar) },
  { label: "Objective", complete: Boolean(brief.objective) },
  { label: "Target Audience", complete: Boolean(brief.audience.trim()) },
  { label: "Topic", complete: Boolean(brief.topic.trim()) },
]);
const incompleteBriefReadinessItems = computed(() => briefReadinessItems.value.filter((item) => !item.complete && !item.optional));
const isBriefReady = computed(() => isBriefReadyValue(brief));
const generatedVariant = computed(() => ({
  ...generatedContent,
  label: generatedContent.title ? "Backend generation" : "Awaiting generation",
}));
const canContinueToCreative = computed(
  () => enabledPlatforms.instagram || enabledPlatforms.linkedin,
);
const creativeStatusOptions = [
  { value: "not-started", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "ready", label: "Ready" },
] as const;
const creativeStatusLabel = computed(
  () =>
    creativeStatusOptions.find((option) => option.value === designStatus.value)
      ?.label ?? "Not Started",
);
const creativeStatusTone = computed(() => {
  if (designStatus.value === "ready") return "success";
  if (designStatus.value === "in-progress") return "info";
  return "neutral";
});
const creativeReferencePlatformOptions = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
];
const creativeReferenceFormatOptions = [
  { value: "single_image", label: "Single image" },
  { value: "carousel", label: "Carousel" },
];
const creativeReferenceSlideCountOptions = Array.from({ length: 9 }, (_, index) => ({ value: String(index + 2), label: `${index + 2} slides` }));
const creativeReferenceStyleOptions = [
  { value: "modern_minimal", label: "Modern minimal" },
  { value: "corporate", label: "Corporate" },
  { value: "editorial", label: "Editorial" },
  { value: "bold_typography", label: "Bold typography" },
  { value: "product_ui_focused", label: "Product UI focused" },
  { value: "abstract_technology", label: "Abstract technology" },
];
const creativeReferenceMoodOptions = [
  { value: "professional", label: "Professional" },
  { value: "confident", label: "Confident" },
  { value: "approachable", label: "Approachable" },
  { value: "innovative", label: "Innovative" },
  { value: "clean", label: "Clean" },
];
const creativeReferenceAspectRatioOptions = [
  { value: "portrait_4_5", label: "Portrait reference" },
  { value: "square_1_1", label: "Square reference" },
  { value: "landscape", label: "Landscape reference" },
];
const latestCreativeReferenceBatch = computed(() => creativeReferenceBatches.value.find((batch) => batch.platform === creativeReferencePlatform.value));
const selectedCreativeReferenceBatch = computed(() => creativeReferenceBatches.value.find((batch) => batch.platform === creativeReferencePlatform.value && batch.references.some((reference) => reference.selected)) ?? null);
const selectedCreativeReference = computed(() => selectedCreativeReferenceBatch.value?.references.find((reference) => reference.selected) ?? null);
const missingCreativeSlideNumbers = computed(() => {
  const batch = latestCreativeReferenceBatch.value;
  if (!batch || batch.creativeFormat !== "carousel") return [];
  const generated = new Set(batch.references.map((reference) => reference.slideNumber ?? reference.conceptIndex + 1));
  return Array.from({ length: batch.expectedReferenceCount }, (_, index) => index + 1).filter((slideNumber) => !generated.has(slideNumber));
});
const storyboardSelected = computed(() => Boolean(latestCreativeReferenceBatch.value?.references.length && latestCreativeReferenceBatch.value.references.every((reference) => reference.selected)));
const creativeReferenceActionLabel = computed(() => creativeReferenceFormat.value === "carousel" ? `Generate ${creativeReferenceSlideCount.value} slides` : "Generate 3 options");
const missingCreativePlatforms = computed(() => {
  const missing: string[] = [];
  if (enabledPlatforms.instagram && instagramAssets.value.length === 0) {
    missing.push("Instagram");
  }
  if (
    enabledPlatforms.linkedin &&
    !reuseInstagramCreative.value &&
    linkedInAssets.value.length === 0
  ) {
    missing.push("LinkedIn");
  }
  if (
    enabledPlatforms.linkedin &&
    reuseInstagramCreative.value &&
    instagramAssets.value.length === 0
  ) {
    missing.push("LinkedIn");
  }
  return missing;
});
const canContinueToReview = computed(
  () => designStatus.value === "ready" && missingCreativePlatforms.value.length === 0,
);
const inheritedLinkedInAssets = computed(() =>
  reuseInstagramCreative.value ? instagramAssets.value : linkedInAssets.value,
);
const enabledReviewPlatforms = computed(() =>
  [
    enabledPlatforms.instagram ? "instagram" : null,
    enabledPlatforms.linkedin ? "linkedin" : null,
  ].filter((platform): platform is "instagram" | "linkedin" => Boolean(platform)),
);
const reviewChecklistComplete = computed(() =>
  Object.values(reviewChecklist).every(Boolean),
);
const reviewChecklistCount = computed(() =>
  Object.values(reviewChecklist).filter(Boolean).length,
);
const reviewChecklistProgress = computed(() =>
  Math.round((reviewChecklistCount.value / Object.keys(reviewChecklist).length) * 100),
);
const reviewNeedsRecheck = computed(() =>
  enabledReviewPlatforms.value.some(
    (platform) => reviewAssessments[platform].state === "needs-recheck" || reviewAssessments[platform].checks.length === 0,
  ),
);
const platformsRequiringOverride = computed(() =>
  enabledReviewPlatforms.value.filter((platform) =>
    reviewAssessments[platform].status === "Needs Attention" || reviewAssessments[platform].checks.some((check) => check.status === "warning"),
  ),
);
const reviewOverridesComplete = computed(() =>
  platformsRequiringOverride.value.every((platform) => Boolean(reviewOverrides[platform].trim())),
);
const canApproveContent = computed(
  () =>
    canContinueToReview.value &&
    canContinueToCreative.value &&
    reviewChecklistComplete.value &&
    !reviewNeedsRecheck.value &&
    reviewOverridesComplete.value,
);
const approvalPendingItems = computed(() => [
  ...(!reviewChecklistComplete.value ? [`Human review: ${reviewChecklistCount.value} of 5 checks complete`] : []),
  ...(reviewNeedsRecheck.value ? ["Re-check edited platform content"] : []),
  ...(!reviewOverridesComplete.value ? ["Resolve alignment warnings with a justification"] : []),
  ...(!canContinueToReview.value ? ["Complete the required creative assets"] : []),
]);
const approvedTimestampLabel = computed(
  () => approvedAt.value ?? "Not approved",
);
const schedulePlatformCount = computed(() => enabledReviewPlatforms.value.length);
const scheduleDateMinimum = computed(() => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARTIFACT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
});
const schedulePlatformRows = computed(() => [
  {
    id: "instagram" as const,
    label: "Instagram",
    copy: instagramContent.caption,
    assets: instagramAssets.value,
    schedule: instagramSchedule,
    record: scheduledRecords.instagram,
  },
  {
    id: "linkedin" as const,
    label: "LinkedIn",
    copy: linkedInContent.postCopy,
    assets: inheritedLinkedInAssets.value,
    schedule: linkedInSchedule,
    record: scheduledRecords.linkedin,
  },
]);
const recentIdeas = computed(() => ideas.recentReadyIdeas.slice(0, 2));

function choosePillar(value: string) {
  brief.pillar = value;
}

function chooseObjective(value: string) {
  brief.objective = value;
}

function applyRecentIdea(idea: ContentIdea) {
  workflow.startFromIdea(idea);
  savedAt.value = null;
  ui.notify(`Idea loaded: ${idea.title}`, "info");
}

async function regenerateContent() {
  if (workflow.loading) return;
  const generated = await workflow.generate();
  if (generated) {
    isEditingDraft.value = false;
    ui.notify("Content regenerated by the backend.", "success");
  }
}

function beginEditingDraft() {
  isEditingDraft.value = true;
  window.setTimeout(() => {
    document.getElementById("generated-title")?.focus();
  }, 0);
}

async function regenerateInstagram() {
  if (workflow.loading || !enabledPlatforms.instagram) return;
  const adapted = await workflow.adapt("instagram");
  if (adapted) {
    isEditingInstagram.value = false;
    ui.notify("Instagram adaptation refreshed.", "success");
  }
}

async function regenerateLinkedIn() {
  if (workflow.loading || !enabledPlatforms.linkedin) return;
  const adapted = await workflow.adapt("linkedin");
  if (adapted) {
    isEditingLinkedIn.value = false;
    ui.notify("LinkedIn adaptation refreshed.", "success");
  }
}

function beginEditingInstagram() {
  isEditingInstagram.value = true;
  window.setTimeout(() => {
    document.getElementById("instagram-caption")?.focus();
  }, 0);
}

function beginEditingLinkedIn() {
  isEditingLinkedIn.value = true;
  window.setTimeout(() => {
    document.getElementById("linkedin-post-copy")?.focus();
  }, 0);
}

function isSupportedCreative(file: File) {
  const allowedTypes = ["image/png", "image/jpeg"];
  const extension = file.name.split(".").pop()?.toLowerCase();
  return allowedTypes.includes(file.type) || ["png", "jpg", "jpeg"].includes(extension ?? "");
}

async function addCreativeFiles(files: FileList | File[], target: "instagram" | "linkedin") {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  const selected = Array.from(files).filter(isSupportedCreative);
  const assets = (await Promise.all(selected.map((file) => workflow.uploadCreative(file)))).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  const rejectedCount = files.length - selected.length;
  const destination = target === "instagram" ? instagramAssets : linkedInAssets;
  destination.value.push(...assets);
  if (rejectedCount > 0) {
    creativeValidation.value = "Only PNG, JPG, and JPEG files can be added.";
  } else {
    creativeValidation.value = "";
  }
  if (assets.length > 0 && designStatus.value === "not-started") designStatus.value = "in-progress";
}

function handleCreativeInput(event: Event, target: "instagram" | "linkedin") {
  const input = event.target as HTMLInputElement;
  if (input.files) addCreativeFiles(input.files, target);
  input.value = "";
}

function handleCreativeDrop(event: DragEvent, target: "instagram" | "linkedin") {
  event.preventDefault();
  if (event.dataTransfer?.files) addCreativeFiles(event.dataTransfer.files, target);
}

function openCreativePicker(target: "instagram" | "linkedin") {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  document.getElementById(`${target}-file-input`)?.click();
}

function removeCreativeAsset(assetId: string, target: "instagram" | "linkedin") {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  const destination = target === "instagram" ? instagramAssets : linkedInAssets;
  const index = destination.value.findIndex((asset) => asset.id === assetId);
  if (index < 0) return;
  destination.value.splice(index, 1);
}

function moveCreativeAsset(
  target: "instagram" | "linkedin",
  fromId: string | null,
  toId: string,
) {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  if (!fromId || fromId === toId) return;
  const destination = target === "instagram" ? instagramAssets : linkedInAssets;
  const fromIndex = destination.value.findIndex((asset) => asset.id === fromId);
  const toIndex = destination.value.findIndex((asset) => asset.id === toId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = destination.value.splice(fromIndex, 1);
  destination.value.splice(toIndex, 0, moved);
}

function copyVisualBrief() {
  const visualBrief = [
    `Recommended Format: ${visualDirection.format}`,
    `Visual Concept: ${visualDirection.concept}`,
    `Slide Structure: ${visualDirection.structure.map((slide, index) => `${String(index + 1).padStart(2, "0")} — ${slide}`).join("; ")}`,
    `Visual Notes: ${visualDirection.notes}`,
  ].join("\n");
  if (!navigator.clipboard) {
    ui.notify("Visual brief is ready to copy manually.", "info");
    return;
  }
  navigator.clipboard
    .writeText(visualBrief)
    .then(() => ui.notify("Visual brief copied to clipboard.", "success"))
    .catch(() => ui.notify("Visual brief is ready to copy manually.", "info"));
}

async function loadCreativeReferences() {
  if (!workflow.contentId) return;
  try {
    const result = await creativeReferenceApi.listCreativeReferences(workflow.contentId);
    creativeReferenceBatches.value = result.data.batches;
    canvaReadyUnavailable.value = !result.data.canvaReadyAvailable;
    if (result.data.batches[0]) applyCreativeReferenceBatchSettings(result.data.batches[0]);
    else creativeReferenceGenerationMode.value = "original_design";
    const selected = result.data.batches.flatMap((batch) => batch.references).find((reference) => reference.selected);
    selectedCreativeReferenceId.value = selected?.id ?? null;
    const pending = result.data.batches.find((batch) => ['pending', 'processing'].includes(batch.status));
    if (pending && !creativeReferenceLoading.value) {
      const controller = new AbortController();
      creativeReferenceAbortController.value = controller;
      creativeReferenceLoading.value = true;
      void monitorCreativeReferenceBatch(workflow.contentId, pending.id, controller.signal).catch((error) => {
        creativeReferenceError.value = errorMessage(error, "Unable to refresh visual reference progress.");
      }).finally(() => {
        if (creativeReferenceAbortController.value === controller) creativeReferenceAbortController.value = null;
        creativeReferenceLoading.value = false;
      });
    }
  } catch (error) {
    creativeReferenceError.value = errorMessage(error, "Unable to load visual references.");
  }
}

function applyCreativeReferenceBatchSettings(batch: BackendCreativeReferenceBatch) {
  creativeReferencePlatform.value = batch.platform;
  creativeReferenceFormat.value = batch.creativeFormat;
  creativeReferenceGenerationMode.value = canvaReadyUnavailable.value ? "original_design" : batch.generationMode ?? "original_design";
  creativeReferenceSlideCount.value = String(batch.expectedReferenceCount);
  creativeReferenceStyle.value = batch.style;
  creativeReferenceMood.value = batch.mood;
  creativeReferenceAspectRatio.value = batch.requestedAspectRatio;
  creativeReferenceInstruction.value = batch.additionalInstruction ?? "";
}

async function retryCreativeReferenceBatch() {
  const batch = latestCreativeReferenceBatch.value;
  if (!batch || batch.creativeFormat !== "carousel") return;
  applyCreativeReferenceBatchSettings(batch);
  await generateCreativeReferences();
}

async function researchCreativeReferenceFacts() {
  if (creativeReferenceFactsLoading.value || !workflow.contentId) return;
  creativeReferenceFactsLoading.value = true;
  creativeReferenceFactsError.value = "";
  try {
    const result = await creativeReferenceApi.discoverCreativeReferenceFacts(workflow.contentId, creativeReferenceFactConcern.value.trim());
    creativeReferenceFacts.value = result.data.facts;
    selectedCreativeReferenceFactIds.value = [];
    if (!result.data.facts.length) creativeReferenceFactsError.value = "No source-backed unique facts were found for this topic. Try refining the content topic.";
  } catch (error) {
    creativeReferenceFactsError.value = errorMessage(error, "Unable to research facts for this topic.");
  } finally {
    creativeReferenceFactsLoading.value = false;
  }
}

function updateCanvaDesignLink(link: NonNullable<typeof workflow.canonical>['canvaDesignLink'] | null) {
  if (!workflow.canonical) return;
  workflow.canonical = { ...workflow.canonical, canvaDesignLink: link };
}

async function generateCreativeReferences() {
  if (creativeReferenceLoading.value || !workflow.contentId || isApproved.value) return;
  if (creativeReferenceInstruction.value.trim().length > 1500) {
    creativeReferenceError.value = "Custom visual direction must be 1,500 characters or fewer.";
    return;
  }
  const generationPlatform = creativeReferencePlatform.value;
  // Replace the active result set immediately; previously generated batches
  // remain persisted and can still be loaded again later.
  creativeReferenceBatches.value = creativeReferenceBatches.value.filter((batch) => batch.platform !== generationPlatform);
  selectedCreativeReferenceId.value = null;
  creativeReferenceLoading.value = true;
  creativeReferenceError.value = "";
  const controller = new AbortController();
  creativeReferenceAbortController.value = controller;
  try {
    const result = await creativeReferenceApi.createCreativeReferences(workflow.contentId, {
      platform: creativeReferencePlatform.value,
      generationMode: creativeReferenceGenerationMode.value,
      format: creativeReferenceFormat.value,
      slideCount: Number(creativeReferenceSlideCount.value),
      style: creativeReferenceStyle.value,
      mood: creativeReferenceMood.value,
      aspectRatio: creativeReferenceAspectRatio.value,
      additionalInstruction: creativeReferenceInstruction.value.trim() || null,
      selectedFacts: creativeReferenceFacts.value.filter((fact) => selectedCreativeReferenceFactIds.value.includes(fact.id)),
    }, createRequestKey("creative-references.create"));
    creativeReferenceBatches.value = [result.data.batch, ...creativeReferenceBatches.value];
    applyCreativeReferenceBatchSettings(result.data.batch);
    selectedCreativeReferenceId.value = result.data.batch.references.find((reference) => reference.selected)?.id ?? selectedCreativeReferenceId.value;
    const finished = await monitorCreativeReferenceBatch(workflow.contentId, result.data.batch.id, controller.signal);
    if (!finished) {
      if (controller.signal.aborted) ui.notify("Stopped monitoring. Generation continues in the background; reopen this page to check its status.", "info");
      return;
    }
    const expected = finished.expectedReferenceCount;
    if (finished.status === "failed") {
      creativeReferenceError.value = "Generation failed. Retry the batch; completed slides remain saved.";
      return;
    }
    ui.notify(finished.status === "partial" ? `${finished.references.length} of ${expected} visual references were generated.` : finished.generationMode === "canva_ready" ? "Canva-ready illustration assets are ready." : finished.creativeFormat === "carousel" ? `${expected}-slide Canva storyboard is ready.` : "Three single-image design options are ready.", finished.status === "partial" ? "warning" : "success");
  } catch (error) {
    if (controller.signal.aborted) {
      ui.notify("Stopped monitoring. Generation continues in the background; reopen this page to check its status.", "info");
      return;
    }
    if (isApiError(error) && error.code === "CANVA_READY_UNSUPPORTED") {
      canvaReadyUnavailable.value = true;
      creativeReferenceGenerationMode.value = "original_design";
    }
    creativeReferenceError.value = errorMessage(error, "Unable to generate visual references.");
  } finally {
    if (creativeReferenceAbortController.value === controller) creativeReferenceAbortController.value = null;
    creativeReferenceLoading.value = false;
  }
}

function cancelCreativeReferenceGeneration() {
  creativeReferenceAbortController.value?.abort();
}

async function monitorCreativeReferenceBatch(contentId: string, batchId: string, signal: AbortSignal) {
  const terminalStatuses = new Set(["completed", "partial", "failed", "cancelled"]);
  const deadline = Date.now() + 30 * 60 * 1000;
  while (!signal.aborted && Date.now() < deadline) {
    const current = creativeReferenceBatches.value.find((batch) => batch.id === batchId);
    if (current && terminalStatuses.has(current.status)) return current;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 2500));
    if (signal.aborted) return null;
    const result = await creativeReferenceApi.listCreativeReferences(contentId);
    creativeReferenceBatches.value = result.data.batches;
    canvaReadyUnavailable.value = !result.data.canvaReadyAvailable;
    const updated = result.data.batches.find((batch) => batch.id === batchId);
    if (updated && terminalStatuses.has(updated.status)) return updated;
  }
  if (!signal.aborted) creativeReferenceError.value = "Generation is still running. You can leave this page and check again later.";
  return null;
}

async function selectCreativeReference(reference: BackendCreativeReference) {
  if (!workflow.contentId || creativeReferenceLoading.value) return;
  try {
    const result = await creativeReferenceApi.selectCreativeReference(workflow.contentId, reference.id);
    creativeReferenceBatches.value = creativeReferenceBatches.value.map((batch) => batch.id === result.data.id ? result.data : batch);
    selectedCreativeReferenceId.value = reference.id;
    await loadCreativeReferences();
    ui.notify("Reference selected for Canva inspiration. Final creative upload is still required.", "success");
  } catch (error) {
    creativeReferenceError.value = errorMessage(error, "Unable to select this reference.");
  }
}

function getCanvaBrief(reference: BackendCreativeReference) {
  const templateName = reference.templateType === "educational" ? "Educational content" : reference.templateType === "product_showcase" ? "Product showcase" : reference.templateType === "process_insight" ? "Process insight" : reference.templateType === "process_carousel" ? "Process carousel" : "Visual concept";
  return [
    `SHIFD LABS — CANVA DESIGN BRIEF`,
    `Template: ${templateName} — ${reference.conceptName}`,
    `Brand: Shifd Labs | Prepare for the next shift.`,
    `Colors: Primary #1363DF · Secondary #3279E7 · Light #E2EDFF · White #FFFFFF · Navy #151B2D`,
    `Typography: Inter for headlines, body and UI; optional DM Serif Text editorial accent.`,
    `Core direction: Modern minimalist tech corporate, professional B2B SaaS, clear single message, mobile readable, generous whitespace, consistent margins and alignment. Keep supporting assets near 30% as a flexible guide.`,
    `\nWHY THIS CONCEPT\n${reference.rationale}`,
    `\nCANVA STEPS\n${reference.canvaBrief ?? reference.layoutNotes}`,
    reference.slideNumber ? `\nSLIDE ${reference.slideNumber} MESSAGE\n${reference.slideCopy ?? ""}` : "",
    `\nLAYOUT\n${reference.layoutNotes}`,
    `\nFOCAL ASSET\n${reference.visualFocus}`,
    `\nTYPE DIRECTION\n${reference.typographyDirection}`,
    `\nCANVA SEARCH KEYWORDS\n${reference.assetSearchKeywords.join(", ") || "mesh gradient, dot grid, workflow diagram, dashboard mockup"}`,
    reference.carouselOutline.length ? `\nCAROUSEL STORYBOARD (${reference.carouselOutline.length} SLIDES)\n${reference.carouselOutline.map((slide, index) => `Slide ${index + 1}: ${slide}`).join("\n")}` : "",
    `\nQUALITY CHECK\nOne clear message; strong hierarchy; readable at mobile size; one relevant visual style; remove decorative clutter; use a real Shifd Approval screenshot for product UI and do not invent product features, metrics or testimonials.`,
  ].filter(Boolean).join("\n");
}

function copyDesignNotes(reference: BackendCreativeReference) {
  const notes = getCanvaBrief(reference);
  if (!navigator.clipboard) {
    ui.notify("Design notes are ready to copy manually.", "info");
    return;
  }
  navigator.clipboard.writeText(notes).then(() => ui.notify("Canva brief copied to clipboard.", "success")).catch(() => ui.notify("Canva brief is ready to copy manually.", "info"));
}

async function getReferenceImageBlob(reference: BackendCreativeReference) {
  const response = await fetch(reference.imageUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Unable to download the visual reference.");
  return response.blob();
}

async function copyReferenceImage(reference: BackendCreativeReference) {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Image clipboard is unavailable.");
    const blob = await getReferenceImageBlob(reference);
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    ui.notify("Image copied. Paste it into Canva with Ctrl/Cmd + V.", "success");
  } catch {
    ui.notify("Image copy is unavailable in this browser. Use Download PNG instead.", "info");
  }
}

async function downloadReferenceImage(reference: BackendCreativeReference) {
  try {
    const blob = await getReferenceImageBlob(reference);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shifd-${reference.templateType ?? "visual-reference"}-${reference.conceptName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || reference.id}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.notify("PNG downloaded. Upload it to Canva or paste it into a design.", "success");
  } catch (error) {
    ui.notify(errorMessage(error, "Unable to download the visual reference."), "warning");
  }
}

async function continueToReview() {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  if (!canContinueToReview.value) {
    creativeValidation.value = designStatus.value !== "ready"
      ? "Set Design Status to Ready after the required creative assets are uploaded."
      : `Add at least one creative asset for ${missingCreativePlatforms.value.join(" and ")} before marking the design Ready.`;
    return;
  }
  if (!workflow.contentId) {
    creativeValidation.value = "Create the Content brief before uploading creative assets.";
    return;
  }
  for (const platform of enabledReviewPlatforms.value) {
    if (platform === "instagram" || !reuseInstagramCreative.value) {
      const assets = platform === "instagram" ? instagramAssets.value : linkedInAssets.value;
      if (!(await workflow.attachCreative(platform, assets))) return;
    }
  }
  if (enabledPlatforms.linkedin && !(await workflow.setReuseCreative(reuseInstagramCreative.value))) return;
  if (!(await workflow.saveEditorial()) || !(await workflow.progress("ready_for_review"))) return;
  creativeValidation.value = "";
  activeStep.value = "review";
}

function markAssessmentNeedsRecheck(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it.";
    return;
  }
  reviewAssessments[platform].state = "needs-recheck";
  reviewOverrides[platform] = "";
  reviewValidation.value = "";
}

function editReviewPlatform(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it.";
    return;
  }
  reviewEditing[platform] = true;
}

function openReviewSection(section: "copy" | "creative" | "brand") {
  const platform = enabledReviewPlatforms.value[0];
  if (!platform) return;
  document.getElementById(`review-${section}-${platform}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function recheckAlignment(platform: "instagram" | "linkedin") {
  if (reviewRecheckLoading.value) return;
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it."
    return
  }
  reviewRecheckLoading.value = true;
  try {
    if (!(await workflow.saveVariant(platform))) return;
    const assessment = await workflow.brandCheck(platform);
    if (assessment) ui.notify(`${platform === "instagram" ? "Instagram" : "LinkedIn"} alignment checked by the backend.`, "success");
  } finally {
    reviewRecheckLoading.value = false;
  }
}

async function regenerateReviewPlatform(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it."
    return
  }
  if (platform === "instagram") await regenerateInstagram();
  else await regenerateLinkedIn();
  reviewEditing[platform] = false;
}

function openOverride(platform: "instagram" | "linkedin") {
  if (isApproved.value) {
    reviewValidation.value = "Approved Content is locked. Request a revision before editing it."
    return
  }
  overridePlatform.value = platform;
  overrideJustification.value = reviewOverrides[platform];
  overrideError.value = "";
  overrideModalOpen.value = true;
}

function guardApprovedEditing() {
  reviewValidation.value = "Approved Content is locked. Request a revision before editing it.";
  if (workflow.contentId) void router.push(`/content/${workflow.contentId}`);
}

function backFromReview() {
  if (isApproved.value) {
    guardApprovedEditing();
    return;
  }
  activeStep.value = "creative";
}

async function confirmOverride() {
  const justification = overrideJustification.value.trim();
  if (!justification) {
    overrideError.value = "Justification is required before recording an override.";
    return;
  }
  const recorded = await workflow.override(overridePlatform.value, justification);
  if (!recorded) {
    overrideError.value = workflow.error || "Unable to record the override.";
    return;
  }
  reviewOverrides[overridePlatform.value] = justification;
  overrideModalOpen.value = false;
  overrideError.value = "";
  reviewValidation.value = "";
  ui.notify("Override recorded.", "success");
}

async function approveContent() {
  if (!canApproveContent.value) {
    reviewValidation.value = reviewNeedsRecheck.value
      ? "Re-check each edited or regenerated platform before approving."
      : !reviewChecklistComplete.value
        ? "Complete the Human Final Review checklist before approving."
        : !reviewOverridesComplete.value
          ? "Record a justification for each alignment warning before approving."
          : "Add the required creative assets before approving this content.";
    return;
  }
  const approved = await workflow.approve();
  if (!approved) {
    reviewValidation.value = workflow.error || "Unable to approve this Content.";
    return;
  }
  reviewValidation.value = "";
  ui.notify("Content approved by human review.", "success");
}

function updatePrimaryScheduleDate(value: string | number) {
  instagramSchedule.date = String(value);
  if (useSameSchedule.value) linkedInSchedule.date = instagramSchedule.date;
}

function updatePrimaryScheduleTime(value: string | number) {
  instagramSchedule.time = String(value);
  if (useSameSchedule.value) linkedInSchedule.time = instagramSchedule.time;
}

function updateScheduleDate(platform: "instagram" | "linkedin", value: string | number) {
  if (platform === "instagram") updatePrimaryScheduleDate(value);
  else linkedInSchedule.date = String(value);
}

function updateScheduleTime(platform: "instagram" | "linkedin", value: string | number) {
  if (platform === "instagram") updatePrimaryScheduleTime(value);
  else linkedInSchedule.time = String(value);
}

function syncScheduleMode() {
  if (useSameSchedule.value) {
    linkedInSchedule.date = instagramSchedule.date;
    linkedInSchedule.time = instagramSchedule.time;
  }
}

function scheduleDateTime(schedule: { date: string; time: string }) {
  return new Date(`${schedule.date}T${schedule.time}:00+07:00`);
}

function formatScheduleDate(date: string, time: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ARTIFACT_TIMEZONE,
  }).format(scheduleDateTime({ date, time }));
}

async function getPublicationTimeRecommendations() {
  if (publicationRecommendationsLoading.value || !workflow.contentId || !enabledReviewPlatforms.value.length) return;
  publicationRecommendationsLoading.value = true;
  publicationRecommendationsError.value = "";
  try {
    const result = await schedulingApi.recommendPublicationTimes(workflow.contentId, enabledReviewPlatforms.value);
    publicationTimeRecommendations.value = result.data.recommendations;
  } catch (error) {
    publicationRecommendationsError.value = errorMessage(error, "Unable to research publication times.");
  } finally {
    publicationRecommendationsLoading.value = false;
  }
}

function applyPublicationTimeRecommendation(recommendation: schedulingApi.PublicationTimeRecommendation) {
  if (useSameSchedule.value) {
    updatePrimaryScheduleDate(recommendation.date);
    updatePrimaryScheduleTime(recommendation.time);
    return;
  }
  updateScheduleDate(recommendation.platform, recommendation.date);
  updateScheduleTime(recommendation.platform, recommendation.time);
}

async function scheduleContent() {
  if (!isApproved.value) {
    scheduleValidation.value = "Approve the content in Review before scheduling.";
    return;
  }
  if (schedulePlatformCount.value === 0) {
    scheduleValidation.value = "Enable at least one platform in Adapt before scheduling.";
    return;
  }
  const schedules = enabledReviewPlatforms.value.map((platform) => ({
    platform,
    schedule: platform === "instagram" ? instagramSchedule : linkedInSchedule,
  }));
  const invalid = schedules.find(
    ({ schedule }) =>
      !schedule.date ||
      !schedule.time ||
      Number.isNaN(scheduleDateTime(schedule).getTime()) ||
      scheduleDateTime(schedule).getTime() <= Date.now(),
  );
  if (invalid) {
    scheduleValidation.value = `Choose a future publication date and time for ${invalid.platform === "instagram" ? "Instagram" : "LinkedIn"}.`;
    return;
  }
  const scheduled = await workflow.schedule();
  if (!scheduled) {
    scheduleValidation.value = workflow.error || "Unable to schedule this Content.";
    return;
  }
  scheduleValidation.value = "";
  ui.notify("Content scheduled for manual publication.", "success");
}

function resetWorkflow() {
  workflow.reset();
  savedAt.value = null;
  creativeValidation.value = "";
  reviewValidation.value = "";
  reviewEditing.instagram = false;
  reviewEditing.linkedin = false;
  overrideModalOpen.value = false;
  overrideJustification.value = "";
  overrideError.value = "";
  scheduleValidation.value = "";
  ui.notify("Started a new content workflow.", "info");
}

function continueToAdapt() {
  void (async () => {
    if (!(await workflow.saveEditorial())) return;
    let adapted = true;
    if (enabledPlatforms.instagram) adapted = Boolean(await workflow.adapt("instagram"));
    if (adapted && enabledPlatforms.linkedin) adapted = Boolean(await workflow.adapt("linkedin"));
    if (adapted) activeStep.value = "adapt";
  })();
}

async function continueToCreative() {
  if (enabledPlatforms.instagram && !(await workflow.saveVariant("instagram"))) return;
  if (enabledPlatforms.linkedin && !(await workflow.saveVariant("linkedin"))) return;
  if (!(await workflow.saveEditorial())) return;
  if (!(await workflow.progress("adapted"))) return;
  activeStep.value = "creative";
  await loadCreativeReferences();
}

function addAudience(suggestion: string) {
  const current = brief.audience.trim();
  if (!current.toLowerCase().includes(suggestion.toLowerCase())) {
    brief.audience = current ? `${current}, ${suggestion}` : suggestion;
  }
}

async function saveDraft() {
  if (isSaving.value) return;
  isSaving.value = true;
  const wasNew = !workflow.contentId;
  const saved = workflow.contentId ? await workflow.saveEditorial() : isBriefReady.value ? await workflow.createFromBrief() : undefined;
  if (saved) {
    if (wasNew && workflow.sourceIdeaId) await ideas.load(true);
    savedAt.value = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
    ui.notify("Brief saved to the backend.", "success");
  }
  isSaving.value = false;
}

function cancelBrief() {
  workflow.startNewWorkflow();
  savedAt.value = null;
  void router.push("/");
}

async function continueToGenerate() {
  if (!isBriefReady.value) {
    ui.notify("Complete the required Brief fields before generating content.", "warning");
    return;
  }
  const created = await workflow.createFromBrief();
  if (!created) return;
  if (workflow.sourceIdeaId) await ideas.load(true);
  if (!(await workflow.generate())) return;
  activeStep.value = "generate";
  ui.notify("Content generated by the backend.", "success");
}

onMounted(() => {
  syncLoadingLock(workflow.loading);
  void Promise.all([ideas.load(), productsStore.load(), companyContext.load()]);
  if (workflow.contentId) void loadCreativeReferences();
});
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
            <div class="create-content-heading"><h1 class="page-header__title">Create Content</h1><PageHeaderHelp :help="pageHelp" /></div>
            <p class="page-header__description">
              Translate strategic brand foundations and verified product
              knowledge into precision AI prompts.
            </p>
          </div>
          <StatusBadge tone="info" dot
            ><AppIcon name="system" :size="14" /> Context Engine: Backend context
            </StatusBadge
          >
        </div>
      </div>
    </header>

    <ContentWorkflowStepper :steps="briefSteps" :current="activeStep" />
    <InlineAlert v-if="workflow.error" title="Content action unavailable" tone="danger">{{ workflow.error }}</InlineAlert>

    <div v-if="activeStep === 'generate'" class="generate-workspace">
      <div class="generate-summary-bar">
        <div>
          <span class="brief-overline">Brief context</span>
          <strong>{{ selectedProductName }} · {{ selectedPillarLabel }} · {{ selectedObjectiveLabel }}</strong>
        </div>
        <div>
          <span class="brief-overline">Topic</span>
          <strong>{{ brief.topic }}</strong>
        </div>
        <StatusBadge tone="info" dot>{{ generatedVariant.label }}</StatusBadge>
      </div>

      <div class="generate-workbench">
        <section class="generate-draft-column">
          <BaseCard title="Content Draft" description="Edit the generated copy inline before adapting it for each platform.">
            <template #actions>
              <BaseButton
                variant="secondary"
                size="compact"
                :aria-pressed="isEditingDraft"
                @click="beginEditingDraft"
              >
                <AppIcon name="settings" :size="15" />{{ isEditingDraft ? "Editing" : "Edit" }}
              </BaseButton>
            </template>
            <div class="generated-fields" :class="{ 'is-editing': isEditingDraft }">
              <BaseInput id="generated-title" v-model="generatedContent.title" label="Title" :number="1" />
              <BaseTextarea v-model="generatedContent.coreMessage" label="Core Message" :rows="2" :number="2" />
              <BaseTextarea v-model="generatedContent.hook" label="Hook" :rows="2" :number="3" />
              <BaseTextarea v-model="generatedContent.body" label="Body" :rows="7" :number="4" />
              <BaseTextarea v-model="generatedContent.cta" label="CTA" :rows="2" :number="5" />
            </div>
            <InlineAlert title="Backend generation" tone="info">
              This draft is generated from the selected Brief by the configured backend AI service.
            </InlineAlert>
          </BaseCard>

          <div class="generate-actions">
            <BaseButton variant="secondary" @click="regenerateContent">
              <AppIcon name="sparkles" :size="16" />Regenerate
            </BaseButton>
            <span class="generate-actions__hint">{{ generatedVariant.label }} · canonical Content response</span>
          </div>
        </section>

        <section class="generate-direction-column">
          <VisualDirectionCard :direction="visualDirection" />
        </section>
      </div>

      <div class="generate-footer">
        <BaseButton variant="ghost" @click="activeStep = 'brief'">
          <AppIcon name="arrow-left" :size="16" />Back to Brief
        </BaseButton>
        <BaseButton size="comfortable" @click="continueToAdapt">
          Continue to Platform Adaptation <AppIcon name="arrow-right" :size="17" />
        </BaseButton>
      </div>
    </div>

    <div v-else-if="activeStep === 'adapt'" class="adapt-workspace">
      <div class="adapt-context-bar">
        <div>
          <span class="brief-overline">Adapting master draft</span>
          <strong>{{ generatedContent.title }}</strong>
        </div>
        <span class="adapt-context-detail">{{ selectedProductName }} · {{ brief.audience }}</span>
      </div>

      <div class="platform-grid">
        <BaseCard title="Instagram" description="Concise, scannable copy for a carousel post.">
          <template #actions>
            <StatusBadge tone="info">Carousel</StatusBadge>
            <BaseCheckbox
              v-model="enabledPlatforms.instagram"
              label="Enabled"
              :disabled="!enabledPlatforms.linkedin"
              aria-label="Enable Instagram adaptation"
            />
          </template>
          <div class="platform-card-body" :class="{ 'is-disabled': !enabledPlatforms.instagram }">
            <div class="platform-card-toolbar">
              <span class="platform-label">Instagram variant</span>
              <BaseButton variant="ghost" size="compact" :aria-pressed="isEditingInstagram" @click="beginEditingInstagram">
                <AppIcon name="settings" :size="15" />{{ isEditingInstagram ? "Editing" : "Edit" }}
              </BaseButton>
            </div>
            <div class="adapt-fields">
              <BaseTextarea id="instagram-caption" v-model="instagramContent.caption" label="Caption" :rows="7" :disabled="!enabledPlatforms.instagram" :number="1" />
              <BaseInput v-model="instagramContent.cta" label="CTA" :disabled="!enabledPlatforms.instagram" :number="2" />
              <BaseTextarea v-model="instagramContent.hashtags" label="Suggested Hashtags" :rows="2" :disabled="!enabledPlatforms.instagram" :number="3" />
              <BaseTextarea v-model="instagramContent.visualRecommendation" label="Visual Recommendation" :rows="4" :disabled="!enabledPlatforms.instagram" :number="4" />
            </div>
            <BaseButton variant="secondary" :disabled="!enabledPlatforms.instagram" @click="regenerateInstagram">
              <AppIcon name="sparkles" :size="16" />Regenerate Instagram
            </BaseButton>
          </div>
        </BaseCard>

        <BaseCard title="LinkedIn" description="Contextual, professional copy for B2B decision-makers.">
          <template #actions>
            <StatusBadge tone="neutral">Thought leadership</StatusBadge>
            <BaseCheckbox
              v-model="enabledPlatforms.linkedin"
              label="Enabled"
              :disabled="!enabledPlatforms.instagram"
              aria-label="Enable LinkedIn adaptation"
            />
          </template>
          <div class="platform-card-body" :class="{ 'is-disabled': !enabledPlatforms.linkedin }">
            <div class="platform-card-toolbar">
              <span class="platform-label">LinkedIn variant</span>
              <BaseButton variant="ghost" size="compact" :aria-pressed="isEditingLinkedIn" @click="beginEditingLinkedIn">
                <AppIcon name="settings" :size="15" />{{ isEditingLinkedIn ? "Editing" : "Edit" }}
              </BaseButton>
            </div>
            <div class="adapt-fields">
              <BaseTextarea id="linkedin-post-copy" v-model="linkedInContent.postCopy" label="Post Copy" :rows="9" :disabled="!enabledPlatforms.linkedin" :number="1" />
              <BaseInput v-model="linkedInContent.cta" label="CTA" :disabled="!enabledPlatforms.linkedin" :number="2" />
              <BaseTextarea v-model="linkedInContent.hashtags" label="Suggested Hashtags" :rows="2" :disabled="!enabledPlatforms.linkedin" :number="3" />
              <BaseTextarea v-model="linkedInContent.visualRecommendation" label="Visual Recommendation" :rows="4" :disabled="!enabledPlatforms.linkedin" :number="4" />
            </div>
            <BaseButton variant="secondary" :disabled="!enabledPlatforms.linkedin" @click="regenerateLinkedIn">
              <AppIcon name="sparkles" :size="16" />Regenerate LinkedIn
            </BaseButton>
          </div>
        </BaseCard>
      </div>

      <InlineAlert v-if="!canContinueToCreative" title="Select at least one platform" tone="warning">
        Enable Instagram or LinkedIn before continuing to Creative.
      </InlineAlert>

      <div class="adapt-footer">
        <BaseButton variant="ghost" @click="activeStep = 'generate'">
          <AppIcon name="arrow-left" :size="16" />Back to Generate
        </BaseButton>
        <BaseButton size="comfortable" :disabled="!canContinueToCreative" @click="continueToCreative">
          Continue to Creative <AppIcon name="arrow-right" :size="17" />
        </BaseButton>
      </div>
    </div>

    <div v-else-if="activeStep === 'creative'" class="creative-workspace">
      <div class="creative-header-bar">
        <div>
          <span class="brief-overline">Creative production</span>
          <strong>Turn the visual direction into upload-ready assets.</strong>
        </div>
        <StatusBadge :tone="creativeStatusTone" dot>{{ creativeStatusLabel }}</StatusBadge>
      </div>

      <div class="creative-brief-grid">
        <VisualDirectionCard
          :direction="visualDirection"
          title="Visual Brief"
          description="The direction generated from your master content."
          copyable
          helper-title="External design tool"
          helper-text="Create your final visual using your preferred design tool, such as Canva, then upload the exported PNG/JPG files below."
          @copy="copyVisualBrief"
        />

        <BaseCard title="Visual production progress" description="Choose the stage that best describes the creative assets for this content.">
          <div class="creative-status-guide" role="group" aria-label="Visual production stage">
            <button
              v-for="(option, index) in creativeStatusOptions"
              :key="option.value"
              type="button"
              :class="{ 'is-active': designStatus === option.value }"
              :aria-pressed="designStatus === option.value"
              :disabled="isApproved"
              @click="designStatus = option.value"
            >
              <span class="creative-status-step">{{ index + 1 }}</span>
              <span class="creative-status-copy">
                <strong>{{ option.label === 'Ready' ? 'Ready for review' : option.label }}</strong>
                <small v-if="option.value === 'not-started'">No visual assets have been uploaded yet.</small>
                <small v-else-if="option.value === 'in-progress'">Assets are being created or still need updates.</small>
                <small v-else>All required assets are uploaded and ready to review.</small>
              </span>
            </button>
          </div>
        </BaseCard>
      </div>

      <BaseCard title="AI Visual Reference" description="Generate visual concepts as design references before creating the final creative in Canva.">
        <fieldset class="creative-generation-mode">
          <legend>Generation mode</legend>
          <label><input v-model="creativeReferenceGenerationMode" type="radio" value="original_design" :disabled="creativeReferenceLoading || isApproved" /><span><strong>Original Design</strong><small>Keep generating complete visual references as before.</small></span></label>
          <label><input v-model="creativeReferenceGenerationMode" type="radio" value="canva_ready" :disabled="creativeReferenceLoading || isApproved || canvaReadyUnavailable" /><span><strong>Canva-Ready Design <StatusBadge tone="info">Experimental</StatusBadge></strong><small>{{ canvaReadyUnavailable ? 'Unavailable: the configured image model does not support transparent backgrounds.' : 'Generate a transparent hero illustration, then compose editable layers locally.' }}</small></span></label>
        </fieldset>
        <div class="creative-reference-form">
          <BaseSelect v-model="creativeReferencePlatform" label="Platform" :options="creativeReferencePlatformOptions" />
          <BaseSelect v-model="creativeReferenceFormat" label="Content format" :options="creativeReferenceFormatOptions" />
          <BaseSelect v-if="creativeReferenceFormat === 'carousel'" v-model="creativeReferenceSlideCount" label="Number of slides" :options="creativeReferenceSlideCountOptions" />
          <BaseSelect v-model="creativeReferenceStyle" label="Style" :options="creativeReferenceStyleOptions" />
          <BaseSelect v-model="creativeReferenceMood" label="Mood" :options="creativeReferenceMoodOptions" />
          <BaseSelect v-model="creativeReferenceAspectRatio" label="Image ratio" :options="creativeReferenceAspectRatioOptions" />
          <BaseTextarea v-model="creativeReferenceInstruction" label="Custom design concerns and visual direction (optional)" hint="Add any specific visual concerns, elements to include or avoid, layout preferences, or brand details." :rows="5" maxlength="1500" placeholder="Example: Use a clean white background, vary the visual metaphor across slides, keep numbering consistent, and reserve space for the Shifd Labs logo on the final slide." />
        </div>
        <section class="creative-reference-facts" aria-labelledby="creative-reference-facts-title">
          <div class="creative-reference-facts-heading">
            <div>
              <h3 id="creative-reference-facts-title">Unique facts for this content</h3>
              <p>Research source-backed facts related to “{{ brief.topic || 'your content topic' }}”. Add a concern to guide the search, then select facts for the visual concepts. If none are selected, they will not be used.</p>
            </div>
            <BaseButton variant="secondary" size="compact" :loading="creativeReferenceFactsLoading" :disabled="creativeReferenceFactsLoading || !workflow.contentId || !brief.topic.trim() || isApproved" @click="researchCreativeReferenceFacts">
              <AppIcon name="search" :size="15" />{{ creativeReferenceFacts.length ? 'Research again' : 'Find unique facts' }}
            </BaseButton>
          </div>
          <BaseTextarea v-model="creativeReferenceFactConcern" label="Research concern (optional)" hint="Tell AI which angle, question, audience concern, or kind of evidence to prioritize alongside the content context." :rows="2" maxlength="1500" placeholder="Example: Find recent evidence about how context affects AI answer quality, especially for small business teams." :disabled="creativeReferenceFactsLoading || isApproved" />
          <InlineAlert v-if="creativeReferenceFactsError" tone="warning">{{ creativeReferenceFactsError }}</InlineAlert>
          <div v-if="creativeReferenceFactsLoading" class="creative-reference-facts-empty" role="status">Searching reliable sources and checking facts…</div>
          <div v-else-if="creativeReferenceFacts.length" class="creative-reference-facts-list">
            <label v-for="fact in creativeReferenceFacts" :key="fact.id" class="creative-reference-fact" :class="{ 'is-selected': selectedCreativeReferenceFactIds.includes(fact.id) }">
              <input v-model="selectedCreativeReferenceFactIds" type="checkbox" :value="fact.id" :disabled="isApproved" />
              <span class="creative-reference-fact-copy">
                <strong>{{ fact.title }}</strong>
                <span>{{ fact.fact }}</span>
                <span class="creative-reference-fact-sources">Sources: <a v-for="(source, index) in fact.sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}<span v-if="index < fact.sources.length - 1"> · </span></a></span>
              </span>
            </label>
          </div>
          <div v-else class="creative-reference-facts-empty">Fact research is optional. Find facts to explore source-backed details, then select only the ones you want included.</div>
        </section>
        <div class="creative-reference-actions">
          <div>
            <strong>{{ creativeReferenceFormat === 'carousel' ? 'One connected storyboard' : 'Three independent design options' }}</strong>
            <p v-if="creativeReferenceFormat === 'carousel'">{{ creativeReferenceGenerationMode === 'canva_ready' ? 'Generate one transparent hero illustration per slide; backgrounds and editable text are composed locally.' : 'Generate one image per slide using the content copy as the narrative source. All slides share the same grid, color palette, typography, and visual language.' }} This uses {{ creativeReferenceSlideCount }} image requests.</p>
            <p v-else>{{ creativeReferenceGenerationMode === 'canva_ready' ? 'Generate three transparent hero illustrations, then build native editable background, decoration, and typography layers locally.' : 'Generate three single-image directions: educational, product showcase, and process insight. Each includes Shifd Labs brand guidance and Canva asset search terms.' }} This uses three image requests.</p>
          </div>
          <BaseButton class="creative-reference-generate-button" size="comfortable" :loading="creativeReferenceLoading" :disabled="creativeReferenceLoading || !workflow.contentId || isApproved" @click="generateCreativeReferences">
            <AppIcon name="sparkles" :size="17" />{{ creativeReferenceActionLabel }}
          </BaseButton>
        </div>
        <section v-if="creativeReferenceLoading" class="creative-reference-generation-state" role="status" aria-live="polite" aria-label="Generating visual references">
          <div class="creative-reference-generation-art" aria-hidden="true">
            <span class="creative-reference-generation-orbit creative-reference-generation-orbit--outer" />
            <span class="creative-reference-generation-orbit creative-reference-generation-orbit--inner" />
            <span v-for="index in 5" :key="index" class="creative-reference-generation-card" :class="`creative-reference-generation-card--${index}`"><i /><i /><i /></span>
            <span class="creative-reference-generation-spark">✦</span>
          </div>
          <div class="creative-reference-generation-copy">
            <strong>{{ creativeReferenceFormat === 'carousel' ? `Building your ${creativeReferenceSlideCount}-slide storyboard` : 'Creating three visual directions' }}</strong>
            <span>Generating the images and keeping each carousel slide in sequence.</span>
            <small><AppIcon name="alert" :size="14" /> Generation continues in the background. You can leave this page and check its progress when you return.</small>
            <BaseButton class="creative-reference-cancel-button" variant="secondary" size="compact" :disabled="!creativeReferenceLoading" @click="cancelCreativeReferenceGeneration">Stop monitoring</BaseButton>
          </div>
        </section>
        <InlineAlert v-if="creativeReferenceError" title="Visual reference" tone="warning">{{ creativeReferenceError }}</InlineAlert>
        <div v-if="latestCreativeReferenceBatch && !creativeReferenceLoading && !['pending', 'processing'].includes(latestCreativeReferenceBatch.status)" class="creative-reference-results">
          <div class="creative-reference-batch-meta">
            <div class="creative-reference-batch-summary">
            <span>{{ ['pending', 'processing'].includes(latestCreativeReferenceBatch.status) ? "Generating visual references" : latestCreativeReferenceBatch.status === "cancelled" ? "Generation cancelled" : latestCreativeReferenceBatch.status === "failed" ? "Generation failed" : latestCreativeReferenceBatch.status === "partial" ? (latestCreativeReferenceBatch.creativeFormat === 'carousel' ? "Incomplete storyboard" : "Partial batch") : "Latest reference batch" }}</span>
              <small v-if="latestCreativeReferenceBatch.creativeFormat === 'carousel'">{{ latestCreativeReferenceBatch.references.length }} of {{ latestCreativeReferenceBatch.expectedReferenceCount }} slides generated<span v-if="missingCreativeSlideNumbers.length"> · Slide{{ missingCreativeSlideNumbers.length === 1 ? '' : 's' }} {{ missingCreativeSlideNumbers.join(', ') }} missing</span> · {{ latestCreativeReferenceBatch.actualGeneratedSize }}</small>
              <small v-else>{{ latestCreativeReferenceBatch.references.length }} of 3 options · {{ latestCreativeReferenceBatch.actualGeneratedSize }}</small>
            </div>
            <div class="creative-reference-batch-actions">
              <BaseButton v-if="['partial', 'cancelled', 'failed'].includes(latestCreativeReferenceBatch.status) && latestCreativeReferenceBatch.creativeFormat === 'carousel'" variant="ghost" size="compact" :disabled="creativeReferenceLoading" @click="retryCreativeReferenceBatch">Retry all {{ latestCreativeReferenceBatch.expectedReferenceCount }} slides</BaseButton>
              <BaseButton v-if="latestCreativeReferenceBatch.creativeFormat === 'carousel' && latestCreativeReferenceBatch.references.length" size="compact" :disabled="storyboardSelected || creativeReferenceLoading" @click="selectCreativeReference(latestCreativeReferenceBatch.references[0])">{{ storyboardSelected ? `Storyboard selected · ${latestCreativeReferenceBatch.references.length}/${latestCreativeReferenceBatch.expectedReferenceCount}` : `Select storyboard · ${latestCreativeReferenceBatch.references.length}/${latestCreativeReferenceBatch.expectedReferenceCount} slides` }}</BaseButton>
            </div>
          </div>
          <div class="creative-reference-grid" :class="{ 'is-carousel': latestCreativeReferenceBatch.creativeFormat === 'carousel' }">
            <article v-for="reference in latestCreativeReferenceBatch.references" :key="reference.id" class="creative-reference-card" :class="{ 'is-selected': reference.selected || selectedCreativeReferenceId === reference.id }">
              <img v-if="latestCreativeReferenceBatch.generationMode !== 'canva_ready'" :src="reference.imageUrl" :alt="`${reference.conceptName} visual reference`" :style="{ aspectRatio: reference.width && reference.height ? `${reference.width} / ${reference.height}` : '4 / 5' }" class="creative-reference-image" />
              <div class="creative-reference-card-body">
                <div class="creative-reference-card-heading"><div><strong>{{ latestCreativeReferenceBatch.creativeFormat === 'carousel' ? `Slide ${reference.slideNumber ?? reference.conceptIndex + 1}: ${reference.conceptName}` : reference.conceptName }}</strong><small class="creative-reference-template-type">{{ latestCreativeReferenceBatch.creativeFormat === 'carousel' ? `${reference.slideNumber ?? reference.conceptIndex + 1} of ${latestCreativeReferenceBatch.expectedReferenceCount} · ${reference.templateType === 'process_carousel' ? 'Carousel sequence' : 'Slide'}` : reference.templateType === "educational" ? "Educational content" : reference.templateType === "product_showcase" ? "Product showcase" : reference.templateType === "process_insight" ? "Process insight" : "Design reference" }}</small></div><StatusBadge v-if="latestCreativeReferenceBatch.creativeFormat !== 'carousel' && (reference.selected || selectedCreativeReferenceId === reference.id)" tone="success">Selected Reference</StatusBadge></div>
                <CanvaReadyComposer v-if="latestCreativeReferenceBatch.generationMode === 'canva_ready'" :reference="reference" :headline="workflow.generatedContent.title" :subtitle="reference.slideCopy || workflow.generatedContent.coreMessage" :cta="workflow.generatedContent.cta" :slide-number="latestCreativeReferenceBatch.creativeFormat === 'carousel' ? reference.slideNumber : null" :slide-count="latestCreativeReferenceBatch.expectedReferenceCount" />
                <dl class="creative-reference-notes">
                  <div v-if="reference.slideCopy"><dt>Slide message</dt><dd>{{ reference.slideCopy }}</dd></div>
                  <div><dt>Rationale</dt><dd>{{ reference.rationale }}</dd></div>
                  <div><dt>Layout</dt><dd>{{ reference.layoutNotes }}</dd></div>
                  <div><dt>Visual focus</dt><dd>{{ reference.visualFocus }}</dd></div>
                  <div><dt>Typography</dt><dd>{{ reference.typographyDirection }}</dd></div>
                  <div v-if="reference.canvaBrief"><dt>Canva steps</dt><dd>{{ reference.canvaBrief }}</dd></div>
                  <div v-if="reference.assetSearchKeywords.length"><dt>Canva search</dt><dd>{{ reference.assetSearchKeywords.join(" · ") }}</dd></div>
                </dl>
                <ol v-if="reference.carouselOutline.length && reference.conceptIndex === 0" class="creative-reference-carousel-outline"><li v-for="(slide, index) in reference.carouselOutline" :key="`${reference.id}-${index}`"><strong>Slide {{ index + 1 }}</strong>{{ slide }}</li></ol>
                <div class="creative-reference-card-actions">
                  <BaseButton v-if="latestCreativeReferenceBatch.creativeFormat !== 'carousel'" size="compact" :disabled="reference.selected || selectedCreativeReferenceId === reference.id" @click="selectCreativeReference(reference)">{{ reference.selected || selectedCreativeReferenceId === reference.id ? "Selected" : "Select reference" }}</BaseButton>
                  <BaseButton variant="ghost" size="compact" @click="copyDesignNotes(reference)">Copy Canva Brief</BaseButton>
                  <BaseButton v-if="latestCreativeReferenceBatch.generationMode !== 'canva_ready'" variant="ghost" size="compact" @click="copyReferenceImage(reference)">Copy Image</BaseButton>
                  <BaseButton v-if="latestCreativeReferenceBatch.generationMode !== 'canva_ready'" variant="ghost" size="compact" @click="downloadReferenceImage(reference)">Download PNG</BaseButton>
                </div>
              </div>
            </article>
            <article v-for="slideNumber in missingCreativeSlideNumbers" :key="`missing-slide-${slideNumber}`" class="creative-reference-card creative-reference-card--missing">
              <div class="creative-reference-missing-visual"><AppIcon name="sparkles" :size="28" /><span>Slide {{ slideNumber }}</span></div>
              <div class="creative-reference-card-body">
                <div class="creative-reference-card-heading"><div><strong>Slide {{ slideNumber }} was not generated</strong><small class="creative-reference-template-type">Missing from this storyboard</small></div></div>
                <p class="creative-reference-missing-note">The image request for this slide did not finish, so it is not available in this batch. Retry all {{ latestCreativeReferenceBatch.expectedReferenceCount }} slides to create a new complete storyboard.</p>
              </div>
            </article>
          </div>
          <InlineAlert title="Keep the final creative separate" tone="info">Use this as inspiration in Canva. Upload your finished PNG/JPG design below; selecting a reference does not satisfy the final creative requirement.</InlineAlert>
          <p v-if="selectedCreativeReference && selectedCreativeReferenceBatch" class="creative-reference-selected-note">{{ selectedCreativeReferenceBatch.creativeFormat === 'carousel' ? `Selected storyboard: ${selectedCreativeReferenceBatch.references.length} of ${selectedCreativeReferenceBatch.expectedReferenceCount} ordered slides` : `Selected reference: ${selectedCreativeReference.conceptName}` }}. The final uploaded creative remains the source used by Review.</p>
        </div>
      </BaseCard>

      <CanvaDesignLinkPanel
        v-if="workflow.contentId"
        :content-id="workflow.contentId"
        :link="workflow.canonical?.canvaDesignLink ?? null"
        :editable="true"
        @updated="updateCanvaDesignLink"
      />

      <div class="creative-platform-grid">
        <BaseCard title="Instagram Creative" description="Upload one or more PNG/JPG files for the carousel.">
          <template #actions><StatusBadge tone="info">{{ instagramAssets.length }} {{ instagramAssets.length === 1 ? "asset" : "assets" }}</StatusBadge></template>
          <div class="creative-upload-stack">
            <div class="creative-dropzone" @dragover.prevent @drop="handleCreativeDrop($event, 'instagram')">
              <AppIcon name="upload" :size="22" />
              <strong>Drop PNG/JPG files here</strong>
              <span>or</span>
              <button type="button" class="brief-text-action" @click="openCreativePicker('instagram')">Browse files</button>
              <small>Multiple files supported for carousel content.</small>
              <input id="instagram-file-input" class="sr-only" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple @change="handleCreativeInput($event, 'instagram')" />
            </div>
            <div v-if="instagramAssets.length" class="creative-asset-grid" aria-label="Instagram creative order">
              <CreativeThumbnail
                v-for="(asset, index) in instagramAssets"
                :key="asset.id"
                :asset="asset"
                :index="index"
                @drag-start="draggedInstagramAssetId = $event"
                @drag-end="draggedInstagramAssetId = null"
                @drop="moveCreativeAsset('instagram', draggedInstagramAssetId, $event)"
                @remove="removeCreativeAsset($event, 'instagram')"
              />
            </div>
            <p v-else class="creative-empty-note">Your carousel previews will appear here in upload order.</p>
          </div>
        </BaseCard>

        <BaseCard title="LinkedIn Creative" description="Reuse the Instagram carousel or provide a separate asset.">
          <template #actions><StatusBadge tone="neutral">{{ reuseInstagramCreative ? "Inherited" : `${linkedInAssets.length} assets` }}</StatusBadge></template>
          <BaseCheckbox v-model="reuseInstagramCreative" label="Use the same creative as Instagram" :disabled="isApproved" />
          <div v-if="reuseInstagramCreative" class="inherited-creative-panel">
            <InlineAlert title="Instagram creative inherited" tone="info">
              LinkedIn will use the same authenticated creative assets unless you switch to a separate upload.
            </InlineAlert>
            <div v-if="inheritedLinkedInAssets.length" class="creative-asset-grid" aria-label="Inherited LinkedIn creative order">
              <CreativeThumbnail
                v-for="(asset, index) in inheritedLinkedInAssets"
                :key="asset.id"
                :asset="asset"
                :index="index"
                inherited
                :removable="false"
              />
            </div>
            <p v-else class="creative-empty-note">Upload Instagram creative to preview the inherited LinkedIn assets.</p>
          </div>
          <div v-else class="creative-upload-stack">
            <div class="creative-dropzone" @dragover.prevent @drop="handleCreativeDrop($event, 'linkedin')">
              <AppIcon name="upload" :size="22" />
              <strong>Drop a LinkedIn PNG/JPG here</strong>
              <span>or</span>
              <button type="button" class="brief-text-action" @click="openCreativePicker('linkedin')">Browse files</button>
              <small>Separate platform creative is stored as a private backend asset.</small>
              <input id="linkedin-file-input" class="sr-only" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple @change="handleCreativeInput($event, 'linkedin')" />
            </div>
            <div v-if="linkedInAssets.length" class="creative-asset-grid" aria-label="LinkedIn creative order">
              <CreativeThumbnail
                v-for="(asset, index) in linkedInAssets"
                :key="asset.id"
                :asset="asset"
                :index="index"
                @drag-start="draggedLinkedInAssetId = $event"
                @drag-end="draggedLinkedInAssetId = null"
                @drop="moveCreativeAsset('linkedin', draggedLinkedInAssetId, $event)"
                @remove="removeCreativeAsset($event, 'linkedin')"
              />
            </div>
            <p v-else class="creative-empty-note">Add a separate LinkedIn image when the inherited creative is disabled.</p>
          </div>
        </BaseCard>
      </div>

      <InlineAlert v-if="creativeValidation" title="Creative validation" tone="warning">
        {{ creativeValidation }}
      </InlineAlert>

      <div class="creative-footer">
        <BaseButton variant="ghost" @click="activeStep = 'adapt'"><AppIcon name="arrow-left" :size="16" />Back to Adapt</BaseButton>
        <BaseButton size="comfortable" @click="continueToReview">Continue to Review <AppIcon name="arrow-right" :size="17" /></BaseButton>
      </div>
    </div>

    <div v-else-if="activeStep === 'review'" class="review-workspace">
      <div class="review-header-bar">
        <div>
          <span class="brief-overline">Controlled approval workspace</span>
          <strong>Review copy, creative, and brand alignment before approval.</strong>
        </div>
        <StatusBadge :tone="isApproved ? 'success' : 'info'" dot>{{ isApproved ? "Approved" : "Human review required" }}</StatusBadge>
      </div>

      <section class="review-platform-grid">
        <BaseCard v-if="enabledPlatforms.instagram" title="Instagram" description="Final carousel copy and authenticated creative preview.">
          <template #actions><StatusBadge tone="info">Instagram</StatusBadge></template>
          <div class="review-platform-body">
            <div id="review-copy-instagram" class="review-copy-fields">
              <div class="review-section-heading"><span class="brief-overline">Final Copy</span><BaseButton variant="ghost" size="compact" @click="editReviewPlatform('instagram')"><AppIcon name="settings" :size="15" />{{ reviewEditing.instagram ? "Editing" : "Edit Manually" }}</BaseButton></div>
              <BaseTextarea v-model="instagramContent.caption" label="Caption" :rows="7" :readonly="!reviewEditing.instagram" :number="1" @input="markAssessmentNeedsRecheck('instagram')" />
              <BaseInput v-model="instagramContent.cta" label="CTA" :readonly="!reviewEditing.instagram" :number="2" @input="markAssessmentNeedsRecheck('instagram')" />
              <BaseTextarea v-model="instagramContent.hashtags" label="Hashtags" :rows="2" :readonly="!reviewEditing.instagram" :number="3" @input="markAssessmentNeedsRecheck('instagram')" />
            </div>
            <div id="review-creative-instagram" class="review-asset-preview-panel">
              <div class="review-section-heading"><span class="brief-overline">Uploaded Creative</span><span class="review-muted">{{ instagramAssets.length }} assets</span></div>
              <div v-if="instagramAssets.length" class="review-asset-strip">
                <div v-for="(asset, index) in instagramAssets" :key="asset.id" class="review-asset-thumb"><img :src="asset.url" :alt="asset.name" /><span>{{ String(index + 1).padStart(2, "0") }}</span></div>
              </div>
              <p v-else class="creative-empty-note">No Instagram creative uploaded.</p>
            </div>
            <BrandAssessmentCard
              id="review-brand-instagram"
              :assessment="reviewAssessments.instagram"
              :override-justification="reviewOverrides.instagram"
              @regenerate="regenerateReviewPlatform('instagram')"
              @recheck="recheckAlignment('instagram')"
              @override="openOverride('instagram')"
            />
          </div>
        </BaseCard>

        <BaseCard v-if="enabledPlatforms.linkedin" title="LinkedIn" description="Final B2B post copy and selected creative preview.">
          <template #actions><StatusBadge tone="neutral">LinkedIn</StatusBadge></template>
          <div class="review-platform-body">
            <div id="review-copy-linkedin" class="review-copy-fields">
              <div class="review-section-heading"><span class="brief-overline">Final Copy</span><BaseButton variant="ghost" size="compact" @click="editReviewPlatform('linkedin')"><AppIcon name="settings" :size="15" />{{ reviewEditing.linkedin ? "Editing" : "Edit Manually" }}</BaseButton></div>
              <BaseTextarea v-model="linkedInContent.postCopy" label="Post Copy" :rows="9" :readonly="!reviewEditing.linkedin" :number="1" @input="markAssessmentNeedsRecheck('linkedin')" />
              <BaseInput v-model="linkedInContent.cta" label="CTA" :readonly="!reviewEditing.linkedin" :number="2" @input="markAssessmentNeedsRecheck('linkedin')" />
              <BaseTextarea v-model="linkedInContent.hashtags" label="Hashtags" :rows="2" :readonly="!reviewEditing.linkedin" :number="3" @input="markAssessmentNeedsRecheck('linkedin')" />
            </div>
            <div id="review-creative-linkedin" class="review-asset-preview-panel">
              <div class="review-section-heading"><span class="brief-overline">Uploaded Creative</span><span class="review-muted">{{ reuseInstagramCreative ? "Inherited from Instagram" : `${linkedInAssets.length} assets` }}</span></div>
              <div v-if="inheritedLinkedInAssets.length" class="review-asset-strip"><div v-for="(asset, index) in inheritedLinkedInAssets" :key="asset.id" class="review-asset-thumb"><img :src="asset.url" :alt="asset.name" /><span>{{ String(index + 1).padStart(2, "0") }}</span></div></div>
              <p v-else class="creative-empty-note">No LinkedIn creative uploaded.</p>
            </div>
            <BrandAssessmentCard
              id="review-brand-linkedin"
              :assessment="reviewAssessments.linkedin"
              :override-justification="reviewOverrides.linkedin"
              @regenerate="regenerateReviewPlatform('linkedin')"
              @recheck="recheckAlignment('linkedin')"
              @override="openOverride('linkedin')"
            />
          </div>
        </BaseCard>
      </section>

      <BaseCard title="Human Final Review" description="Review the actual content, then record your final decision.">
        <div class="human-review-layout">
          <div class="human-review-checklist">
            <div class="review-progress-card">
              <div class="review-progress-heading"><div><span class="brief-overline">Review progress</span><strong>{{ reviewChecklistCount }} of 5 checks complete</strong></div><StatusBadge :tone="reviewChecklistComplete ? 'success' : 'neutral'">{{ reviewChecklistProgress }}%</StatusBadge></div>
              <div class="review-progress-track" role="progressbar" aria-label="Human review progress" :aria-valuenow="reviewChecklistProgress" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${reviewChecklistProgress}%` }" /></div>
            </div>
            <div class="human-review-item">
              <BaseCheckbox v-model="reviewChecklist.copyReviewed" label="I reviewed the final copy" :disabled="isApproved" />
              <p>Read the caption or post copy, CTA, and hashtags for every enabled platform.</p>
              <BaseButton variant="ghost" size="compact" :disabled="isApproved" @click="openReviewSection('copy')">Open copy <AppIcon name="arrow-right" :size="14" /></BaseButton>
            </div>
            <div class="human-review-item">
              <BaseCheckbox v-model="reviewChecklist.creativeReviewed" label="I reviewed the creative" :disabled="isApproved" />
              <p>Check each image or carousel for legibility, quality, and correct framing.</p>
              <BaseButton variant="ghost" size="compact" :disabled="isApproved" @click="openReviewSection('creative')">Open creative <AppIcon name="arrow-right" :size="14" /></BaseButton>
            </div>
            <div class="human-review-item">
              <BaseCheckbox v-model="reviewChecklist.visualCopyConsistent" label="Visuals match the message" :disabled="isApproved" />
              <p>Confirm the creative supports the claim and tone in the copy.</p>
              <BaseButton variant="ghost" size="compact" :disabled="isApproved" @click="openReviewSection('creative')">Compare content <AppIcon name="arrow-right" :size="14" /></BaseButton>
            </div>
            <div class="human-review-item">
              <BaseCheckbox v-model="reviewChecklist.noErrors" label="Claims and details are accurate" :disabled="isApproved" />
              <p>Check names, numbers, spelling, links, and any factual or product claims.</p>
              <BaseButton variant="ghost" size="compact" :disabled="isApproved" @click="openReviewSection('copy')">Check copy <AppIcon name="arrow-right" :size="14" /></BaseButton>
            </div>
            <div class="human-review-item">
              <BaseCheckbox v-model="reviewChecklist.readyForPublication" label="This is ready to publish" :disabled="isApproved" />
              <p>Confirm the content is complete and appropriate for its intended audience.</p>
              <BaseButton variant="ghost" size="compact" :disabled="isApproved" @click="openReviewSection('brand')">Review alignment <AppIcon name="arrow-right" :size="14" /></BaseButton>
            </div>
          </div>
          <div class="approval-panel">
            <span class="brief-overline">Approval decision</span>
            <h3>{{ isApproved ? 'Content approved' : canApproveContent ? 'Ready for your approval' : 'A few things need attention' }}</h3>
            <p>AI checks are guidance. You are responsible for the final decision and publication readiness.</p>
            <div v-if="!isApproved && approvalPendingItems.length" class="approval-next-steps">
              <strong>Still needed</strong>
              <ul><li v-for="item in approvalPendingItems" :key="item">{{ item }}</li></ul>
            </div>
            <ul v-else class="approval-requirements">
              <li :class="{ 'is-complete': reviewChecklistComplete }">Human review complete</li>
              <li :class="{ 'is-complete': !reviewNeedsRecheck }">Platform checks are current</li>
              <li :class="{ 'is-complete': reviewOverridesComplete }">Alignment warnings addressed</li>
              <li :class="{ 'is-complete': canContinueToReview }">Creative requirements met</li>
            </ul>
            <div v-if="isApproved" class="approval-success"><StatusBadge tone="success" dot>Approved</StatusBadge><strong>Approved by: {{ approvedBy ?? 'Backend reviewer' }}</strong><span>{{ approvedTimestampLabel }}</span><BaseButton variant="secondary" size="compact" @click="router.push(`/content/${workflow.contentId}`)">Request Revision</BaseButton></div>
            <BaseButton v-else size="comfortable" :disabled="!canApproveContent" @click="approveContent">Approve Content <AppIcon name="check" :size="17" /></BaseButton>
          </div>
        </div>
      </BaseCard>

      <InlineAlert v-if="reviewValidation" title="Review action required" tone="warning">{{ reviewValidation }}</InlineAlert>

      <div class="review-footer">
        <BaseButton variant="ghost" @click="backFromReview"><AppIcon name="arrow-left" :size="16" />Back to Creative</BaseButton>
        <BaseButton v-if="isApproved" size="comfortable" @click="activeStep = 'schedule'">Continue to Schedule <AppIcon name="arrow-right" :size="17" /></BaseButton>
        <span v-else class="review-footer-hint">Approval unlocks the Schedule step.</span>
      </div>

      <BaseModal v-model="overrideModalOpen" title="Override Brand Check" description="This content has an alignment warning. Please explain why it should proceed." size="default">
        <BaseTextarea v-model="overrideJustification" label="Justification" :rows="4" :error="overrideError" required :number="1" />
        <template #footer><BaseButton variant="ghost" @click="overrideModalOpen = false">Cancel</BaseButton><BaseButton @click="confirmOverride">Confirm Override</BaseButton></template>
      </BaseModal>
    </div>

    <div v-else-if="activeStep === 'schedule'" class="schedule-workspace">
      <template v-if="!isScheduled">
        <BaseCard title="Approved Content" description="A compact handoff summary for the publication plan.">
          <div class="approved-summary-grid">
            <div><span class="brief-overline">Content Title</span><strong>{{ generatedContent.title }}</strong></div>
            <div><span class="brief-overline">Product / Context</span><strong>{{ brief.context === 'general' ? 'General topic' : brief.context === 'company' ? companyContext.companyProfile.name : selectedProductName }}</strong></div>
            <div><span class="brief-overline">Content Pillar</span><strong>{{ selectedPillarLabel }}</strong></div>
            <div><span class="brief-overline">Objective</span><strong>{{ selectedObjectiveLabel }}</strong></div>
            <div><span class="brief-overline">Approved By</span><strong>{{ approvedBy ?? 'Backend reviewer' }}</strong></div>
            <div><span class="brief-overline">Approval Timestamp</span><strong>{{ approvedTimestampLabel }}</strong></div>
          </div>
          <template #footer><StatusBadge tone="success" dot>Approved by human review</StatusBadge></template>
        </BaseCard>

        <BaseCard title="Publication Schedule" description="Choose when each approved platform variant should be ready for manual publication.">
          <template #actions><BaseCheckbox v-model="useSameSchedule" label="Use same schedule for all platforms" @update:model-value="syncScheduleMode" /></template>
          <section class="publication-recommendations" aria-labelledby="publication-recommendations-title">
            <div class="publication-recommendations-heading">
              <div>
                <h3 id="publication-recommendations-title">AI posting time recommendations</h3>
                <p>Research suggested dates and times for each enabled platform, based on your content and current public research.</p>
              </div>
              <BaseButton variant="secondary" size="compact" :loading="publicationRecommendationsLoading" :disabled="publicationRecommendationsLoading || !workflow.contentId || !schedulePlatformCount" @click="getPublicationTimeRecommendations">
                <AppIcon name="sparkles" :size="15" />{{ publicationTimeRecommendations.length ? 'Research again' : 'Get recommendations' }}
              </BaseButton>
            </div>
            <InlineAlert v-if="publicationRecommendationsError" tone="warning">{{ publicationRecommendationsError }}</InlineAlert>
            <div v-if="publicationRecommendationsLoading" class="publication-recommendations-empty" role="status">Checking recent platform guidance and research…</div>
            <div v-else-if="publicationTimeRecommendations.length" class="publication-recommendation-list">
              <article v-for="recommendation in publicationTimeRecommendations" :key="recommendation.platform" class="publication-recommendation">
                <div class="publication-recommendation-title">
                  <div><strong>{{ recommendation.platform === 'instagram' ? 'Instagram' : 'LinkedIn' }}</strong><span>{{ formatScheduleDate(recommendation.date, recommendation.time) }} · {{ recommendation.timezone }}</span></div>
                  <BaseButton size="compact" @click="applyPublicationTimeRecommendation(recommendation)">{{ useSameSchedule ? 'Use for all platforms' : 'Use this time' }}</BaseButton>
                </div>
                <p>{{ recommendation.rationale }}</p>
                <div class="publication-recommendation-sources">Sources: <a v-for="(source, index) in recommendation.sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}<span v-if="index < recommendation.sources.length - 1"> · </span></a></div>
              </article>
            </div>
            <p v-else class="publication-recommendations-note">Recommendations use public research and your content context, not private account analytics. Treat the suggested time as a starting point and compare results with your own audience insights.</p>
          </section>
          <div class="schedule-platform-grid">
            <template v-for="row in schedulePlatformRows" :key="row.id">
              <section v-if="enabledPlatforms[row.id]" class="schedule-platform-card">
                <div class="schedule-platform-heading"><div><h3>{{ row.label }}</h3><span class="brief-overline">Approved variant</span></div><StatusBadge tone="success" dot>Approved</StatusBadge></div>
                <div class="schedule-fields">
                  <BaseInput
                    :model-value="row.schedule.date"
                    label="Publication date"
                    :number="1"
                    type="date"
                    :min="scheduleDateMinimum"
                    :disabled="row.id === 'linkedin' && useSameSchedule"
                    @update:model-value="updateScheduleDate(row.id, $event)"
                  />
                  <BaseInput
                    :model-value="row.schedule.time"
                    label="Publication time"
                    :number="2"
                    type="time"
                    :disabled="row.id === 'linkedin' && useSameSchedule"
                    @update:model-value="updateScheduleTime(row.id, $event)"
                  />
                </div>
                <div class="schedule-preview-grid">
                  <div><span class="brief-overline">Final copy preview</span><p>{{ row.copy }}</p></div>
                  <div><span class="brief-overline">Creative preview</span><div v-if="row.assets.length" class="schedule-asset-strip"><img v-for="asset in row.assets.slice(0, 3)" :key="asset.id" :src="asset.url" :alt="asset.name" /><span v-if="row.assets.length > 3">+{{ row.assets.length - 3 }}</span></div><p v-else class="creative-empty-note">No creative preview</p></div>
                </div>
              </section>
            </template>
          </div>
        </BaseCard>

        <InlineAlert v-if="scheduleValidation" title="Schedule validation" tone="warning">{{ scheduleValidation }}</InlineAlert>

        <div class="schedule-footer">
          <BaseButton variant="ghost" @click="activeStep = 'review'"><AppIcon name="arrow-left" :size="16" />Back to Review</BaseButton>
          <BaseButton size="comfortable" @click="scheduleContent">Schedule Content <AppIcon name="calendar" :size="17" /></BaseButton>
        </div>
      </template>

      <BaseCard v-else title="Content Scheduled" description="The approved content is now recorded in the backend.">
        <div class="schedule-success-state"><StatusBadge tone="success" dot>Scheduled</StatusBadge><h2>Ready for manual publication</h2><p>Publishing remains manual. Shifd Marketing will keep the approved copy, creative assets, and schedule ready for publication.</p></div>
        <div class="scheduled-platform-list">
          <template v-for="row in schedulePlatformRows" :key="row.id"><div v-if="enabledPlatforms[row.id]" class="scheduled-platform-row"><div><strong>{{ row.label }}</strong><span>{{ formatScheduleDate(row.record.date, row.record.time) }}</span></div><StatusBadge tone="success">{{ row.record.status }}</StatusBadge></div></template>
        </div>
        <template #footer>
          <div class="schedule-success-actions"><BaseButton variant="secondary" @click="router.push('/calendar')"><AppIcon name="calendar" :size="16" />View in Calendar</BaseButton><BaseButton variant="secondary" @click="router.push(`/content/${workflow.contentId}`)">View Content</BaseButton><BaseButton @click="resetWorkflow"><AppIcon name="plus" :size="16" />Create Another Content</BaseButton></div>
        </template>
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
                  ><InfoTooltip align="end" label="Content context information" text="Choose which background the content should use. Company adds organization and brand context; Product adds a selected product's context; General uses the topic without either." />
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
                    title="Use the company's business, audience, and brand information as context."
                    @click="brief.context = 'company'"
                  >
                    Company
                  </button>
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="brief.context === 'general'"
                    :class="{ 'is-selected': brief.context === 'general' }"
                    title="Create topic-led content without company or product background."
                    @click="brief.context = 'general'; brief.product = ''"
                  >
                    General
                  </button>
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="brief.context === 'product'"
                    :class="{ 'is-selected': brief.context === 'product' }"
                    title="Use a selected product's audience, value proposition, and brand context."
                    @click="brief.context = 'product'"
                  >
                    Product
                  </button>
                </div>
                <p v-if="brief.context === 'general'" class="brief-context-hint">Create topic-led content without company or product context.</p>
              </div>
              <div class="brief-field-group">
                <div class="brief-field-heading">
                  <div class="brief-heading-label"><span class="brief-overline">Product Asset Link</span><InfoTooltip label="Product asset information" text="Choose the product whose profile should inform the brief and generated content." /></div>
                  <StatusBadge
                    :tone="brief.context === 'product' ? 'success' : brief.context === 'general' ? 'neutral' : 'info'"
                    dot
                    >{{
                      brief.context === 'product'
                        ? 'Context active'
                        : brief.context === 'general' ? 'No linked context' : 'Company context'
                    }}</StatusBadge
                  >
                </div>
                <div class="brief-product-select">
                  <BaseSelect
                    v-model="brief.product"
                    label="Product asset"
                    :options="productOptions"
                    :disabled="brief.context !== 'product'"
                  />
                </div>
              </div>
            </div>

            <fieldset class="brief-field-group brief-fieldset">
              <legend class="brief-field-heading">
                <span class="brief-overline">Content Pillar</span
                ><InfoTooltip align="end" label="Content pillar information" text="The pillar sets the main kind of story this content tells, such as teaching, explaining a problem, or showing a use case." />
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
                  :title="item.description"
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
                ><InfoTooltip align="end" label="Strategic objective information" text="Choose the intended audience outcome. This guides the content's purpose, from first awareness through evaluation or discovery." />
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
                  :title="item.description"
                  @click="chooseObjective(item.value)"
                >
                  <AppIcon :name="item.icon" :size="18" /><span>{{
                    item.label
                  }}</span>
                </button>
              </div>
            </fieldset>

            <div class="brief-input-grid">
              <div class="brief-field-group">
                <BaseInput
                  v-model="brief.audience"
                  label="Target audience"
                  :number="1"
                  tooltip="Describe who should find this content relevant, such as a role, team, organization type, or customer group. A specific audience helps shape examples, language, and level of detail."
                />
                <div class="quick-add-row">
                  <span class="brief-overline">Quick add</span>
                  <button
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
                :number="2"
                :hint="`${topicLength} characters`"
                tooltip="State the subject and main message for this piece. Keep it focused: generation uses this as the central topic to develop."
                class="brief-large-input"
              />
            </div>

            <BaseTextarea
              v-model="brief.thesis"
              label="Content angle and thesis"
              :rows="4"
              :number="3"
              tooltip="Describe the argument or perspective behind the topic, including the key takeaway you want the audience to remember."
            />

            <BaseTextarea
              v-model="brief.constraints"
              label="Execution constraints and style tone"
              :rows="3"
              :number="4"
              tooltip="Set writing and execution rules for generation: tone, length, required details, and claims or topics to avoid."
            />
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
              >Saved at {{ savedAt }}</span
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
        <BaseCard title="Active Context">
          <template #actions
            ><StatusBadge :tone="brief.context === 'general' ? 'info' : 'success'" dot>{{ brief.context === 'general' ? 'General' : 'Active' }}</StatusBadge></template
          >
          <dl class="context-details">
            <div>
              <dt>Context</dt>
              <dd>{{ brief.context === "general" ? "General topic" : brief.context === "company" ? companyContext.companyProfile.name : selectedProductName }}</dd>
            </div>
            <div v-if="activeContextAudience && activeContextAudience !== 'Not set'">
              <dt>Audience</dt>
              <dd>{{ activeContextAudience }}</dd>
            </div>
            <div v-if="brief.context !== 'general' && activeContextValue">
              <dt>Key value</dt>
              <dd>{{ activeContextValue }}</dd>
            </div>
            <div v-if="activeBrandVoice">
              <dt>{{ brief.context === 'general' ? 'Writing style' : 'Brand voice' }}</dt>
              <dd>{{ activeBrandVoice }}</dd>
            </div>
          </dl>
        </BaseCard>

        <BaseCard title="Brief Readiness">
          <template #actions
            ><StatusBadge :tone="isBriefReady ? 'success' : 'warning'" dot>{{
              isBriefReady ? "Ready to generate" : "Needs details"
            }}</StatusBadge></template
          >
          <div v-if="!isBriefReady" class="readiness-list">
            <div
              v-for="item in incompleteBriefReadinessItems"
              :key="item.label"
              class="readiness-item"
              :class="{ 'is-complete': item.complete }"
            >
              <AppIcon
                :name="item.complete ? 'check' : 'circle'"
                :size="16"
              />
              <span>{{ item.label }}</span>
              <small v-if="item.optional">Optional</small>
            </div>
          </div>
          <p v-else class="readiness-complete-note">All required details are in place.</p>
        </BaseCard>

        <BaseCard v-if="recentIdeas.length" title="Recent Ideas">
          <div class="recent-angle-list">
            <button
              v-for="idea in recentIdeas"
              :key="idea.id"
              type="button"
              @click="applyRecentIdea(idea)"
            >
              <strong>{{ idea.title }}</strong><span>{{ pillarOptions.find((option) => option.value === idea.pillar)?.label }} · {{ idea.contextType === 'company' ? companyContext.companyProfile.name : idea.contextType === 'general' ? 'General' : productsStore.nameFor(idea.productId) }}</span>
            </button>
          </div>
          <button
            type="button"
            class="brief-text-action recent-ideas-link"
            @click="router.push('/content/ideas')"
          >
            View all ideas <AppIcon name="arrow-right" :size="14" />
          </button>
        </BaseCard>
      </aside>
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="contentBusy"
      class="content-loading-overlay"
      role="status"
      aria-live="polite"
      :aria-label="reviewRecheckLoading ? 'Pemeriksaan ulang sedang berlangsung' : 'Konten sedang diproses'"
    >
      <div class="content-loading-overlay__content">
        <template v-if="reviewRecheckLoading">
          <div class="alignment-loader-art" aria-hidden="true">
            <span class="alignment-loader-art__orbit" />
            <span class="alignment-loader-art__scan" />
            <span class="alignment-loader-art__target">✓</span>
            <i class="alignment-loader-art__point alignment-loader-art__point--one" />
            <i class="alignment-loader-art__point alignment-loader-art__point--two" />
            <i class="alignment-loader-art__point alignment-loader-art__point--three" />
          </div>
          <strong>Memeriksa ulang keselarasan brand</strong>
          <span>Sedang menyimpan perubahan dan mencocokkan caption, CTA, serta konteks brand. Hasil pemeriksaan akan segera diperbarui.</span>
        </template>
        <template v-else>
          <div class="content-loader-art" aria-hidden="true">
            <span class="content-loader-art__orbit content-loader-art__orbit--one" />
            <span class="content-loader-art__orbit content-loader-art__orbit--two" />
            <span class="content-loader-art__sheet content-loader-art__sheet--back" />
            <span class="content-loader-art__sheet content-loader-art__sheet--middle" />
            <span class="content-loader-art__sheet content-loader-art__sheet--front">
              <i /><i /><i />
            </span>
            <span class="content-loader-art__spark">✦</span>
            <span class="content-loader-art__dot content-loader-art__dot--one" />
            <span class="content-loader-art__dot content-loader-art__dot--two" />
          </div>
          <strong>Konten sedang disiapkan</strong>
          <span>Mohon tunggu, proses ini bisa memerlukan beberapa saat.</span>
        </template>
      </div>
    </div>
  </Teleport>
</template>
