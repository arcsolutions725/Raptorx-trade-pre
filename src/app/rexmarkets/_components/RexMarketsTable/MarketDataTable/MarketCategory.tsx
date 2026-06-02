"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import clsx from "clsx";
import { useKalshiCategories } from "@/hooks/useKalshiCategories";
import { usePolymarketCategories } from "@/hooks/usePolymarketCategories";
import { useLimitlessNavigation } from "@/hooks/useLimitlessNavigation";
import { useLimitlessTagGroups } from "@/hooks/useLimitlessTagGroups";
import {
  usePolymarketTags,
  type PolymarketTag,
} from "@/hooks/usePolymarketTags";
import { useDataSource } from "@/contexts/DataSourceContext";
import { usePredictFunNavigation } from "@/hooks/usePredictFunNavigation";
import {
  PREDICT_FUN_DEFAULT_CATEGORY_VALUE,
  predictFunLabelFromValue,
  predictFunTagIdFromLabel,
  predictFunTagIdFromValue,
} from "@/lib/predictfun/navigation";
import { usePredictFunCategorySubTags } from "@/hooks/usePredictFunCategorySubTags";

/** Myriad listing topics (GET /markets?topics=) — match Myriad web filters. */
const MYRIAD_CATEGORIES: Record<string, string[]> = {
  All: ["all"],
  Crypto: ["Crypto"],
  Sports: ["Sports"],
  Politics: ["Politics"],
  Economy: ["Economy"],
  Gaming: ["Gaming"],
  Culture: ["Culture"],
};

type MarketCategoryProps = {
  onCategoryChange?: (category: string | null) => void;
  onTagChange?: (tag: string | null) => void;
  selectedCategory?: string | null;
  selectedTag?: string | null;
};

type SliderStyle = {
  left: number;
  width: number;
};

const CATEGORY_SKELETON_PILL_WIDTHS = [
  "w-10",
  "w-14",
  "w-16",
  "w-14",
  "w-[4.5rem]",
  "w-12",
  "w-16",
] as const;

function MarketCategorySkeleton() {
  return (
    <div className="w-full mb-2" aria-busy="true" aria-live="polite">
      <div className="relative flex h-[44px] w-full max-w-full items-center overflow-hidden rounded-xl bg-white/[0.06] p-0.5">
        <div className="flex min-w-max items-center gap-0.5 px-0.5">
          {CATEGORY_SKELETON_PILL_WIDTHS.map((width, index) => (
            <div
              key={index}
              className={clsx(
                "h-10 shrink-0 animate-pulse rounded-[10px] bg-white/[0.04]",
                width,
              )}
              aria-hidden
            />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading categories</span>
    </div>
  );
}

export default function MarketCategory({
  onCategoryChange,
  onTagChange,
  selectedCategory: externalSelectedCategory,
  selectedTag: externalSelectedTag,
}: MarketCategoryProps) {
  const { dataSource } = useDataSource();
  const isAllMode = dataSource === "all";
  
  // Only enable Kalshi categories when dataSource is "kalshi" or "all"
  const {
    categoriesData: kalshiCategories,
    isLoading: kalshiLoading,
    isError: kalshiError,
    error: kalshiErrorObj,
  } = useKalshiCategories(dataSource === "kalshi" || dataSource === "all");
  
  // Only enable Polymarket categories when dataSource is "polymarket" or "all"
  const {
    categoriesData: polymarketCategories,
    isLoading: polymarketLoading,
    isError: polymarketError,
    error: polymarketErrorObj,
  } = usePolymarketCategories(dataSource === "polymarket" || dataSource === "all");

  // Only enable Limitless categories when dataSource is "limitless" or "all"
  const {
    categoriesData: limitlessCategories,
    slugToId: limitlessSlugToId,
    isLoading: limitlessLoading,
    isError: limitlessError,
    error: limitlessErrorObj,
  } = useLimitlessNavigation(dataSource === "limitless" || dataSource === "all");

  const {
    categoriesData: predictFunCategories,
    allNav: predictFunAllNav,
    isLoading: predictFunLoading,
    isError: predictFunError,
    error: predictFunErrorObj,
  } = usePredictFunNavigation(dataSource === "predictfun");

  // Store display names for categories in "all" mode
  const categoryDisplayNames = useMemo(() => {
    if (!isAllMode) return {};
    
    const displayNames: Record<string, string> = {};
    
    // Collect display names from Kalshi
    if (kalshiCategories && typeof kalshiCategories === "object") {
      Object.keys(kalshiCategories).forEach((category) => {
        const normalized = category.toLowerCase().trim();
        if (!displayNames[normalized]) {
          displayNames[normalized] = category;
        }
      });
    }
    
    // Collect display names from Polymarket (prefer if both exist)
    if (polymarketCategories && typeof polymarketCategories === "object") {
      Object.keys(polymarketCategories).forEach((category) => {
        const normalized = category.toLowerCase().trim();
        displayNames[normalized] = category; // Polymarket takes precedence for display
      });
    }

    // Collect display names from Limitless
    if (limitlessCategories && typeof limitlessCategories === "object") {
      Object.keys(limitlessCategories).forEach((category) => {
        const normalized = category.toLowerCase().trim();
        if (!displayNames[normalized]) displayNames[normalized] = category;
      });
    }
    
    return displayNames;
  }, [isAllMode, kalshiCategories, polymarketCategories, limitlessCategories]);

  // Merge categories when in "all" mode
  const mergedCategoriesData = useMemo(() => {
    if (!isAllMode) {
      if (dataSource === "polymarket") return polymarketCategories;
      if (dataSource === "limitless") return limitlessCategories;
      if (dataSource === "myriad") return MYRIAD_CATEGORIES;
      if (dataSource === "predictfun") return predictFunCategories;
      return kalshiCategories;
    }
    
    // Merge categories from both sources, grouping by normalized category name
    const merged: Record<string, string[]> = {};
    
    // Add Kalshi categories
    if (kalshiCategories && typeof kalshiCategories === "object") {
      Object.entries(kalshiCategories).forEach(([category, tags]) => {
        if (Array.isArray(tags) && tags.length > 0) {
          const normalizedCategory = category.toLowerCase().trim();
          if (!merged[normalizedCategory]) {
            merged[normalizedCategory] = [];
          }
          // Add tags with source prefix to avoid conflicts
          tags.forEach(tag => {
            if (!merged[normalizedCategory].includes(`kalshi:${tag}`)) {
              merged[normalizedCategory].push(`kalshi:${tag}`);
            }
          });
        }
      });
    }
    
    // Add Polymarket categories
    if (polymarketCategories && typeof polymarketCategories === "object") {
      Object.entries(polymarketCategories).forEach(([category, slugs]) => {
        if (Array.isArray(slugs) && slugs.length > 0) {
          const normalizedCategory = category.toLowerCase().trim();
          if (!merged[normalizedCategory]) {
            merged[normalizedCategory] = [];
          }
          // Add slugs with source prefix
          slugs.forEach(slug => {
            if (!merged[normalizedCategory].includes(`polymarket:${slug}`)) {
              merged[normalizedCategory].push(`polymarket:${slug}`);
            }
          });
        }
      });
    }

    // Add Limitless categories (from navigation API)
    if (limitlessCategories && typeof limitlessCategories === "object") {
      Object.entries(limitlessCategories).forEach(([category, slugs]) => {
        if (Array.isArray(slugs) && slugs.length > 0) {
          const normalizedCategory = category.toLowerCase().trim();
          if (!merged[normalizedCategory]) {
            merged[normalizedCategory] = [];
          }
          slugs.forEach(slug => {
            if (!merged[normalizedCategory].includes(`limitless:${slug}`)) {
              merged[normalizedCategory].push(`limitless:${slug}`);
            }
          });
        }
      });
    }
    
    return merged;
  }, [isAllMode, dataSource, kalshiCategories, polymarketCategories, limitlessCategories]);

  // Select the appropriate data source
  const categoriesData = mergedCategoriesData;
  const isLoading = isAllMode
    ? (kalshiLoading || polymarketLoading || limitlessLoading)
    : dataSource === "myriad"
      ? false
      : dataSource === "predictfun"
        ? predictFunLoading
      : dataSource === "polymarket"
      ? polymarketLoading
      : dataSource === "limitless"
        ? limitlessLoading
        : kalshiLoading;
  const isError = isAllMode
    ? (kalshiError || polymarketError || limitlessError)
    : dataSource === "myriad"
      ? false
      : dataSource === "predictfun"
        ? predictFunError
      : dataSource === "polymarket"
      ? polymarketError
      : dataSource === "limitless"
        ? limitlessError
        : kalshiError;
  const error = isAllMode
    ? (kalshiErrorObj || polymarketErrorObj || limitlessErrorObj)
    : dataSource === "myriad"
      ? null
      : dataSource === "predictfun"
        ? predictFunErrorObj
      : dataSource === "polymarket"
      ? polymarketErrorObj
      : dataSource === "limitless"
        ? limitlessErrorObj
        : kalshiErrorObj;
  const [internalCategory, setInternalCategory] = useState<string | null>(null);
  const [internalTag, setInternalTag] = useState<string | null>(null);
  const categoryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const categoryContainerRef = useRef<HTMLDivElement | null>(null);
  const tagsContainerRef = useRef<HTMLDivElement | null>(null);
  const [sliderStyle, setSliderStyle] = useState<SliderStyle | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Hover and scroll state
  const [isCategoryHovered, setIsCategoryHovered] = useState(false);
  const [isTagHovered, setIsTagHovered] = useState(false);
  const [canScrollCategoryLeft, setCanScrollCategoryLeft] = useState(false);
  const [canScrollCategoryRight, setCanScrollCategoryRight] = useState(false);
  const [canScrollTagLeft, setCanScrollTagLeft] = useState(false);
  const [canScrollTagRight, setCanScrollTagRight] = useState(false);

  const selectedCategory =
    externalSelectedCategory !== undefined
      ? externalSelectedCategory
      : internalCategory;
  const selectedTag =
    externalSelectedTag !== undefined ? externalSelectedTag : internalTag;

  const predictFunParentTagId = useMemo(() => {
    if (dataSource !== "predictfun" || !selectedCategory) return null;
    return (
      predictFunTagIdFromValue(selectedCategory) ??
      predictFunTagIdFromLabel(selectedCategory)
    );
  }, [dataSource, selectedCategory]);

  const {
    tags: predictFunCategorySubTags,
    hasSubTags: predictFunHasCategorySubTags,
    isLoading: predictFunCategorySubTagsLoading,
  } = usePredictFunCategorySubTags(
    predictFunParentTagId,
    dataSource === "predictfun"
  );

  const predictFunShowSubTagNav = useMemo(() => {
    if (dataSource !== "predictfun" || !predictFunParentTagId) return false;
    return predictFunHasCategorySubTags;
  }, [dataSource, predictFunParentTagId, predictFunHasCategorySubTags]);

  // Limitless tag groups: only for categories with tags (Crypto, Sport, Finance); not for Other
  const limitlessCategoryId = useMemo(() => {
    if ((dataSource !== "limitless" && dataSource !== "all") || !selectedCategory || !limitlessSlugToId) return null;
    return limitlessSlugToId[selectedCategory] ?? null;
  }, [dataSource, selectedCategory, limitlessSlugToId]);
  const { data: limitlessTagGroupsData } = useLimitlessTagGroups(
    limitlessCategoryId,
    (dataSource === "limitless" || dataSource === "all") && !!limitlessCategoryId
  );
  const limitlessTagGroups = limitlessTagGroupsData?.tagGroups ?? [];

  // Get the category slug for Polymarket tags fetching (must be after selectedCategory is declared)
  const categorySlugForTags = useMemo(() => {
    if ((dataSource !== "polymarket" && dataSource !== "all") || !selectedCategory || !polymarketCategories) {
      return null;
    }

    // In "all" mode, check if the selected category contains polymarket tags
    if (isAllMode && categoriesData[selectedCategory.toLowerCase()]) {
      const tags = categoriesData[selectedCategory.toLowerCase()];
      const polymarketTag = tags.find((tag: string) => tag.startsWith("polymarket:"));
      if (polymarketTag) {
        return polymarketTag.replace("polymarket:", "");
      }
    }

    // selectedCategory might be a slug already, or we need to find it
    // First check if it's already a slug by checking if it exists in any category's array
    for (const [categoryLabel, slugs] of Object.entries(polymarketCategories)) {
      if (Array.isArray(slugs) && slugs.includes(selectedCategory)) {
        return selectedCategory;
      }
    }

    // If not found, check if selectedCategory is a category label
    // Check if it's a direct key in polymarketCategories
    if (polymarketCategories[selectedCategory]) {
      const slugs = polymarketCategories[selectedCategory];
      if (Array.isArray(slugs) && slugs.length > 0) {
        return slugs[0];
      }
    }

    // Also check case-insensitive match
    for (const [categoryLabel, slugs] of Object.entries(polymarketCategories)) {
      if (
        categoryLabel.toLowerCase() === selectedCategory.toLowerCase() &&
        Array.isArray(slugs) &&
        slugs.length > 0
      ) {
        return slugs[0];
      }
    }

    return null;
  }, [dataSource, isAllMode, selectedCategory, polymarketCategories, categoriesData]);

  // Fetch tags for Polymarket when a category is selected
  const {
    tags: polymarketTags,
    isLoading: polymarketTagsLoading,
  } = usePolymarketTags(
    categorySlugForTags,
    dataSource === "polymarket" || dataSource === "all"
  );

  const normalizeCategoryKey = useCallback((cat: string) => {
    return cat
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/&/g, "and")
      .replace(/[^\w\s]/g, "")
      .trim();
  }, []);

  const categories = useMemo(() => {
    if (!categoriesData || typeof categoriesData !== "object") {
      return [];
    }
    // For Polymarket, categories have slugs stored in arrays
    // For Kalshi, categories have tags stored in arrays
    // Both should be shown if they have at least one element (slug or tag)
    const entries = Object.entries(categoriesData).filter(
      (entry): entry is [string, string[]] =>
        Array.isArray(entry[1]) && entry[1].length > 0
    );
    
    // In "all" mode, use display names for better presentation
    if (isAllMode && Object.keys(categoryDisplayNames).length > 0) {
      return entries.map(([key, value]) => [
        categoryDisplayNames[key.toLowerCase().trim()] || key,
        value,
      ]) as [string, string[]][];
    }
    
    return entries;
  }, [categoriesData, isAllMode, categoryDisplayNames]);

  // Helper function to map a slug back to its category label (for Polymarket)
  const getCategoryLabelFromSlug = useCallback(
    (slugOrLabel: string | null): string | null => {
      if (!slugOrLabel || !categoriesData) return null;

      // First, check if it's already a category label
      if (categoriesData[slugOrLabel]) {
        return slugOrLabel;
      }

      // For Polymarket or Limitless, find which category contains this slug
      if (
        dataSource === "polymarket" ||
        dataSource === "limitless" ||
        dataSource === "myriad" ||
        dataSource === "predictfun"
      ) {
        for (const [categoryLabel, slugs] of Object.entries(categoriesData)) {
          if (!Array.isArray(slugs)) continue;
          if (slugs.includes(slugOrLabel)) return categoryLabel;
          if (dataSource === "predictfun") {
            if (slugs.some((s) => s === slugOrLabel)) return categoryLabel;
            const label = predictFunLabelFromValue(slugOrLabel);
            if (label === categoryLabel) return categoryLabel;
          }
        }
      }

      // If not found, return the original value (might be a label for Kalshi)
      return slugOrLabel;
    },
    [categoriesData, dataSource]
  );

  // Reset refs array when categories change
  useEffect(() => {
    categoryButtonRefs.current = new Array(categories.length).fill(null);
  }, [categories.length]);

  // Limitless tag item: { label, value } where value is "paramKey:paramValue"
  type LimitlessTagItem = { label: string; value: string };

  // For Polymarket, tags are objects with label and slug
  // For Kalshi, tags are strings. For Limitless, tags are { label, value } from tag groups.
  const selectedTags = useMemo(() => {
    if (dataSource === "myriad") return [];

    if (dataSource === "predictfun") {
      if (!predictFunParentTagId) return [];
      return predictFunCategorySubTags.map((t) => ({
        label: t.label,
        value: `predictfun:${t.tagId}`,
      }));
    }

    // Limitless: only show tags when category has tag groups (Crypto, Sport, Finance); not for Other
    if (dataSource === "limitless" || (isAllMode && selectedCategory && limitlessSlugToId?.[selectedCategory])) {
      if (limitlessTagGroups.length > 0) {
        const flat: LimitlessTagItem[] = [];
        limitlessTagGroups.forEach((group) => {
          group.tags.forEach((tag) => {
            flat.push({ label: tag.name, value: `${group.paramKey}:${tag.paramValue}` });
          });
        });
        return flat;
      }
      return []; // Other and categories with no tags: don't show tag section
    }

    if (!selectedCategory || !categoriesData) {
      return [];
    }

    // In "all" mode, merge tags from both sources
    if (isAllMode) {
      const categoryKey = selectedCategory?.toLowerCase().trim();
      if (!categoryKey || !categoriesData || typeof categoriesData !== "object") {
        return [];
      }
      
      const categoryTags = categoriesData[categoryKey];
      
      if (!Array.isArray(categoryTags) || categoryTags.length === 0) {
        return [];
      }
      
      // Extract Kalshi tags
      const kalshiTags = categoryTags
        .filter((tag: string) => tag.startsWith("kalshi:"))
        .map((tag: string) => tag.replace("kalshi:", ""));
      
      // Extract Polymarket tags (use fetched tags if available, otherwise use slugs)
      const polymarketSlugs = categoryTags
        .filter((tag: string) => tag.startsWith("polymarket:"))
        .map((tag: string) => tag.replace("polymarket:", ""));
      
      // If we have fetched Polymarket tags, use them; otherwise use slugs as fallback
      const polymarketTagsToUse = Array.isArray(polymarketTags) && polymarketTags.length > 0
        ? polymarketTags
        : polymarketSlugs.map((slug: string) => ({ label: slug, slug }));
      
      // Combine tags: Kalshi tags as strings, Polymarket tags as objects
      const combinedTags: (string | PolymarketTag)[] = [
        ...kalshiTags,
        ...polymarketTagsToUse,
      ];
      
      return combinedTags;
    }

    // For Polymarket, use the fetched tags from the API
    if (dataSource === "polymarket") {
      // Only return tags if they exist (non-empty array)
      // If API returns empty, we don't show tags including "ALL"
      return Array.isArray(polymarketTags) && polymarketTags.length > 0
        ? polymarketTags
        : [];
    }

    // For Kalshi, tags are strings
    if (categoriesData[selectedCategory]) {
      const tags = categoriesData[selectedCategory];
      return Array.isArray(tags) ? tags : [];
    }

    const entries = Object.keys(categoriesData);
    const lowerMatch = entries.find(
      (key) => key.toLowerCase() === selectedCategory.toLowerCase()
    );

    const normalizedSelected = normalizeCategoryKey(selectedCategory);

    const normalizedMatch =
      lowerMatch ||
      entries.find((key) => normalizeCategoryKey(key) === normalizedSelected) ||
      entries.find((key) => {
        const normalizedKey = normalizeCategoryKey(key);
        return (
          normalizedKey.includes(normalizedSelected) ||
          normalizedSelected.includes(normalizedKey)
        );
      });

    if (normalizedMatch) {
      const tags = categoriesData[normalizedMatch];
      return Array.isArray(tags) ? tags : [];
    }

    return [];
  }, [
    categoriesData,
    normalizeCategoryKey,
    selectedCategory,
    dataSource,
    isAllMode,
    polymarketTags,
    limitlessTagGroups,
    limitlessSlugToId,
    predictFunCategorySubTags,
    predictFunParentTagId,
  ]);

  // Helper to check if selected tag matches (handles string, PolymarketTag, LimitlessTagItem)
  const isTagSelected = useCallback(
    (tag: string | PolymarketTag | LimitlessTagItem): boolean => {
      if (!selectedTag) return false;
      if (dataSource === "predictfun") {
        if (typeof tag === "object" && tag !== null && "value" in tag) {
          return selectedTag === (tag as LimitlessTagItem).value;
        }
        return false;
      }
      if (typeof tag === "object" && tag !== null && "value" in tag && !("slug" in tag)) {
        const limitTag = tag as LimitlessTagItem;
        const v = limitTag.value;
        return (
          selectedTag === v ||
          selectedTag === `limitless:${v}` ||
          selectedTag === `predictfun:${v.replace(/^predictfun:/, "")}` ||
          (v.startsWith("predictfun:") && selectedTag === v)
        );
      }
      if (isAllMode) {
        if (typeof tag === "string") return tag === selectedTag || `kalshi:${tag}` === selectedTag || tag === `kalshi:${selectedTag}`;
        const tagObj = tag as PolymarketTag;
        return tagObj.slug === selectedTag || `polymarket:${tagObj.slug}` === selectedTag;
      }
      if (dataSource === "polymarket") return (tag as PolymarketTag).slug === selectedTag;
      return tag === selectedTag;
    },
    [selectedTag, dataSource, isAllMode]
  );

  // Helper to get tag value for onTagChange (slug for Polymarket, string for Kalshi, paramKey:paramValue for Limitless)
  const getTagValue = useCallback(
    (tag: string | PolymarketTag | LimitlessTagItem): string => {
      if (typeof tag === "object" && tag !== null && "value" in tag && !("slug" in tag)) {
        const limitTag = tag as LimitlessTagItem;
        if (dataSource === "predictfun") return limitTag.value;
        return isAllMode ? `limitless:${limitTag.value}` : limitTag.value;
      }
      if (isAllMode) {
        if (typeof tag === "string") return `kalshi:${tag}`;
        return `polymarket:${(tag as PolymarketTag).slug}`;
      }
      if (dataSource === "polymarket") return (tag as PolymarketTag).slug;
      return tag as string;
    },
    [dataSource, isAllMode]
  );

  // Helper to get tag display label
  const getTagLabel = useCallback(
    (tag: string | PolymarketTag | LimitlessTagItem): string => {
      if (typeof tag === "object" && tag !== null) {
        if ("label" in tag && "value" in tag && !("slug" in tag)) return (tag as LimitlessTagItem).label;
        if ("label" in tag && "slug" in tag) return (tag as PolymarketTag).label;
      }
      return tag as string;
    },
    []
  );

  const handleCategoryClick = useCallback(
    (category: string) => {
      // Predict.fun: always select a tab (never toggle off to unfiltered null)
      if (dataSource === "predictfun") {
        const selectedCategoryLabel = selectedCategory
          ? getCategoryLabelFromSlug(selectedCategory)
          : null;
        const isCurrentlySelected =
          !!selectedCategoryLabel &&
          selectedCategoryLabel.toLowerCase() === category.toLowerCase();

        let categoryToPass: string = PREDICT_FUN_DEFAULT_CATEGORY_VALUE;
        if (!isCurrentlySelected && categoriesData?.[category]?.[0]) {
          categoryToPass = categoriesData[category][0];
        } else if (!isCurrentlySelected) {
          const id = predictFunTagIdFromLabel(category);
          categoryToPass = id
            ? `predictfun:${id}`
            : PREDICT_FUN_DEFAULT_CATEGORY_VALUE;
        }

        if (externalSelectedCategory === undefined) {
          setInternalCategory(category);
        }
        onCategoryChange?.(categoryToPass);
        if (externalSelectedTag === undefined) setInternalTag(null);
        onTagChange?.(null);
        return;
      }

      // Get the category label from selectedCategory (which might be a slug for Polymarket)
      const selectedCategoryLabel = selectedCategory
        ? getCategoryLabelFromSlug(selectedCategory)
        : null;
      const isCurrentlySelected = selectedCategoryLabel
        ? selectedCategoryLabel.toLowerCase() === category.toLowerCase()
        : false;
      const newCategory = isCurrentlySelected ? null : category;

      if (externalSelectedCategory === undefined) {
        setInternalCategory(newCategory);
      }

      // For Polymarket, we need to pass the slug instead of the label
      // The slug is stored as the first element in the tags array
      // For Kalshi, we pass the category name directly
      // In "all" mode, pass the normalized category name
      let categoryToPass = newCategory;
      if (isAllMode && newCategory) {
        // In "all" mode, use the normalized category name
        categoryToPass = newCategory.toLowerCase().trim();
      } else if (
        (dataSource === "polymarket" ||
          dataSource === "limitless" ||
          dataSource === "myriad") &&
        newCategory &&
        categoriesData &&
        typeof categoriesData === "object" &&
        categoriesData[newCategory] &&
        Array.isArray(categoriesData[newCategory]) &&
        categoriesData[newCategory].length > 0
      ) {
        // Use the slug if available (stored as first element in array)
        const slug = categoriesData[newCategory][0];
        if (slug && typeof slug === "string" && !slug.includes(":")) {
          categoryToPass = slug;
        }
      }

      onCategoryChange?.(categoryToPass);

      if (externalSelectedTag === undefined) {
        setInternalTag(null);
      }
      onTagChange?.(null);
    },
    [
      externalSelectedCategory,
      externalSelectedTag,
      onCategoryChange,
      onTagChange,
      selectedCategory,
      categoriesData,
      getCategoryLabelFromSlug,
      dataSource,
      isAllMode,
    ]
  );

  const handleTagClick = useCallback(
    (tag: string | PolymarketTag | LimitlessTagItem) => {
      const tagValue = getTagValue(tag);
      const newTag = selectedTag === tagValue ? null : tagValue;
      if (externalSelectedTag === undefined) {
        setInternalTag(newTag);
      }
      onTagChange?.(newTag);
    },
    [externalSelectedTag, onTagChange, selectedTag, getTagValue]
  );

  const handleClearTag = useCallback(() => {
    if (externalSelectedTag === undefined) {
      setInternalTag(null);
    }
    onTagChange?.(null);
  }, [externalSelectedTag, onTagChange]);

  // Find the index of the active category to calculate slider position
  const activeCategoryIndex = useMemo(() => {
    if (!selectedCategory) return -1;
    
    // Get the category label from the selected category (which might be a slug)
    const categoryLabel = getCategoryLabelFromSlug(selectedCategory);
    if (!categoryLabel) return -1;

    return categories.findIndex(
      ([category]) =>
        categoryLabel.toLowerCase() === category.toLowerCase()
    );
  }, [categories, selectedCategory, getCategoryLabelFromSlug]);

  // Function to update slider position
  const updateSliderPosition = useCallback(() => {
    if (
      activeCategoryIndex < 0 ||
      !categoryButtonRefs.current[activeCategoryIndex] ||
      !categoryContainerRef.current
    ) {
      setSliderStyle(null);
      return;
    }

    const activeButton = categoryButtonRefs.current[activeCategoryIndex];
    const container = categoryContainerRef.current;
    const flexContainer = activeButton.parentElement;

    if (!flexContainer || !activeButton) {
      setSliderStyle(null);
      return;
    }

    try {
      // Get the flex container's position relative to the scrollable container
      const flexContainerRect = flexContainer.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const flexContainerLeft =
        flexContainerRect.left - containerRect.left + container.scrollLeft;

      // Get button position relative to flex container
      const buttonLeft = activeButton.offsetLeft;

      // Account for container padding (p-0.5 = 2px)
      const padding = 2;

      setSliderStyle({
        left: flexContainerLeft + buttonLeft + padding,
        width: activeButton.offsetWidth,
      });
    } catch (err) {
      // Silently fail if calculation errors occur (e.g., during unmount)
      console.warn("Failed to update slider position:", err);
      setSliderStyle(null);
    }
  }, [activeCategoryIndex]);

  // Update slider position based on active button
  useEffect(() => {
    // Use requestAnimationFrame for smoother updates
    const rafId = requestAnimationFrame(() => {
      updateSliderPosition();
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeCategoryIndex, categories.length, updateSliderPosition]);

  // Check scrollability for categories
  const checkCategoryScrollability = useCallback(() => {
    const container = categoryContainerRef.current;
    if (!container) {
      setCanScrollCategoryLeft(false);
      setCanScrollCategoryRight(false);
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollCategoryLeft(scrollLeft > 0);
    setCanScrollCategoryRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // Check scrollability for tags
  const checkTagScrollability = useCallback(() => {
    const container = tagsContainerRef.current;
    if (!container) {
      setCanScrollTagLeft(false);
      setCanScrollTagRight(false);
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollTagLeft(scrollLeft > 0);
    setCanScrollTagRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // Scroll handlers
  const scrollCategory = useCallback((direction: "left" | "right") => {
    const container = categoryContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    const newScrollLeft =
      direction === "left"
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: "smooth",
    });
  }, []);

  const scrollTags = useCallback((direction: "left" | "right") => {
    const container = tagsContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    const newScrollLeft =
      direction === "left"
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: "smooth",
    });
  }, []);

  // Update slider position on window resize and scroll
  useEffect(() => {
    let rafId: number | null = null;

    const scheduleUpdate = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        updateSliderPosition();
        checkCategoryScrollability();
      });
    };

    const handleResize = () => {
      scheduleUpdate();
    };

    const handleCategoryScroll = () => {
      updateSliderPosition();
      checkCategoryScrollability();
    };

    window.addEventListener("resize", handleResize, { passive: true });

    const container = categoryContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleCategoryScroll, {
        passive: true,
      });
    }

    // Use ResizeObserver for more efficient resize detection
    if (container && typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserverRef.current.observe(container);
    }

    // Initial check
    checkCategoryScrollability();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (container) {
        container.removeEventListener("scroll", handleCategoryScroll);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [updateSliderPosition, checkCategoryScrollability]);

  // Check tags scrollability
  useEffect(() => {
    if (!selectedCategory) return;

    // Delay to ensure DOM is updated
    const timer = setTimeout(() => {
      checkTagScrollability();
    }, 0);

    const container = tagsContainerRef.current;
    if (!container) {
      clearTimeout(timer);
      return;
    }

    const handleTagScroll = () => {
      checkTagScrollability();
    };

    container.addEventListener("scroll", handleTagScroll, { passive: true });

    // Also check on resize
    const handleResize = () => {
      checkTagScrollability();
    };
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      clearTimeout(timer);
      container.removeEventListener("scroll", handleTagScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [selectedCategory, selectedTags.length, checkTagScrollability]);

  // Early returns after all hooks
  if (isLoading) {
    return <MarketCategorySkeleton />;
  }

  // In "all" mode, only show error if both sources fail
  // Otherwise, show categories from the available source
  if (isError && !isAllMode) {
    return (
      <div
        className="p-6 bg-black/30 border border-white/10 rounded-lg"
        role="alert"
      >
        <div className="text-red-400">
          Failed to load categories:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </div>
    );
  }

  // In "all" mode, if both sources have errors, show error
  if (isError && isAllMode && kalshiError && polymarketError) {
    return (
      <div
        className="p-6 bg-black/30 border border-white/10 rounded-lg"
        role="alert"
      >
        <div className="text-red-400">
          Failed to load categories from both sources
        </div>
      </div>
    );
  }

  if (!categoriesData || typeof categoriesData !== "object") {
    // In "all" mode, if we have some data, continue; otherwise show message
    if (isAllMode && (kalshiCategories || polymarketCategories)) {
      // Continue with available data
    } else {
      return (
        <div className="p-6 bg-black/30 border border-white/10 rounded-lg">
          <div className="text-white/70">No category data available</div>
        </div>
      );
    }
  }

  if (categories.length === 0) {
    // In "all" mode, if we're still loading one source, show loading
    if (isAllMode && (kalshiLoading || polymarketLoading)) {
      return <MarketCategorySkeleton />;
    }
    return (
      <div className="p-4 bg-black/30 border border-white/10 rounded-lg">
        <div className="text-white/70">No categories available</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Categories - Switch Tab Style */}
      <div className="mb-2">
        <div
          className="relative inline-flex items-center h-[44px] group"
          style={{ maxWidth: "100%" }}
          onMouseEnter={() => setIsCategoryHovered(true)}
          onMouseLeave={() => setIsCategoryHovered(false)}
        >
          {/* Left Arrow Button */}
          {isCategoryHovered && canScrollCategoryLeft && (
            <button
              onClick={() => scrollCategory("left")}
              className="absolute left-0 z-20 h-full px-2 bg-gradient-to-r from-black/80 to-transparent hover:from-black/90 flex items-center justify-center transition-opacity"
              aria-label="Scroll categories left"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white"
              >
                <path
                  d="M10 12L6 8L10 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          {/* Right Arrow Button */}
          {isCategoryHovered && canScrollCategoryRight && (
            <button
              onClick={() => scrollCategory("right")}
              className="absolute right-0 z-20 h-full px-2 bg-gradient-to-l from-black/80 to-transparent hover:from-black/90 flex items-center justify-center transition-opacity"
              aria-label="Scroll categories right"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white"
              >
                <path
                  d="M6 4L10 8L6 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          <div
            ref={categoryContainerRef}
            className="relative flex items-center bg-white/12 p-0.5 overflow-x-auto scrollbar-none"
            style={{
              borderRadius: "12px",
              maxWidth: "100%",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x pan-y",
              overscrollBehavior: "contain",
              scrollBehavior: "smooth",
            }}
          >
            {/* Animated background slider */}
            {sliderStyle && (
              <div
                className="absolute top-[2px] bottom-[2px] bg-[#3C3C3C] shadow-md pointer-events-none"
                style={{
                  left: `${sliderStyle.left}px`,
                  width: `${sliderStyle.width}px`,
                  height: "40px",
                  borderRadius: "12px",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  willChange: "left, width",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
                }}
              />
            )}

            {/* Categories Container */}
            <div className="relative flex items-center justify-start min-w-max gap-0">
              {categories.map(([category], index) => {
                // Get the category label from selectedCategory (which might be a slug for Polymarket)
                const selectedCategoryLabel = selectedCategory
                  ? getCategoryLabelFromSlug(selectedCategory)
                  : null;
                const isActive = selectedCategoryLabel
                  ? selectedCategoryLabel.toLowerCase() === category.toLowerCase()
                  : false;
                return (
                  <button
                    key={category}
                    ref={(el) => {
                      categoryButtonRefs.current[index] = el;
                    }}
                    onClick={() => handleCategoryClick(category)}
                    aria-pressed={isActive}
                    aria-label={`Filter by ${category} category`}
                    className={clsx(
                      "relative z-10 font-medium text-xs whitespace-nowrap transition-colors duration-200 flex items-center justify-center flex-shrink-0",
                      isActive
                        ? "text-white font-semibold"
                        : "text-white hover:text-white/90"
                    )}
                    style={{
                      padding: "10px 14px",
                      height: "40px",
                      borderRadius: "12px",
                    }}
                  >
                    <span className="capitalize">{category}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tags - Tab Style with Border Bottom */}
      {/* Only show tags section if category is selected AND tags are available (non-empty) */}
      {selectedCategory &&
        (dataSource === "predictfun"
          ? predictFunShowSubTagNav
          : selectedTags.length > 0) && (
        <div
          className="relative inline-flex items-center group"
          style={{ maxWidth: "100%" }}
          onMouseEnter={() => setIsTagHovered(true)}
          onMouseLeave={() => setIsTagHovered(false)}
        >
          {/* Left Arrow Button */}
          {isTagHovered && canScrollTagLeft && (
            <button
              onClick={() => scrollTags("left")}
              className="absolute left-0 z-20 h-full px-2 bg-gradient-to-r from-black/80 to-transparent hover:from-black/90 flex items-center justify-center transition-opacity"
              aria-label="Scroll tags left"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white"
              >
                <path
                  d="M10 12L6 8L10 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          {/* Right Arrow Button */}
          {isTagHovered && canScrollTagRight && (
            <button
              onClick={() => scrollTags("right")}
              className="absolute right-0 z-20 h-full px-2 bg-gradient-to-l from-black/80 to-transparent hover:from-black/90 flex items-center justify-center transition-opacity"
              aria-label="Scroll tags right"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white"
              >
                <path
                  d="M6 4L10 8L6 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          <div
            ref={tagsContainerRef}
            className="overflow-x-auto scrollbar-none"
            style={{
              maxWidth: "100%",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x pan-y",
              overscrollBehavior: "contain",
              scrollBehavior: "smooth",
            }}
          >
            <div className="flex items-center gap-0 min-w-max border-b border-white/20">
              <button
                onClick={handleClearTag}
                aria-pressed={selectedTag === null}
                aria-label="Show all tags"
                className={clsx(
                  "relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2",
                  selectedTag === null
                    ? "text-[#ffc000] border-b-[#ffc000]"
                    : "text-white/70 hover:text-white border-b-transparent"
                )}
              >
                All
              </button>
              {dataSource === "predictfun" && predictFunCategorySubTagsLoading ? (
                <span
                  className="px-4 py-3 text-sm text-white/50 italic"
                  role="status"
                >
                  Loading tags…
                </span>
              ) : selectedTags.length > 0 ? (
                selectedTags.map((tag, tagIndex) => {
                  const tagLabel = getTagLabel(tag);
                  let tagKey: string;
                  if (typeof tag === "object" && tag !== null && "value" in tag && !("slug" in tag)) {
                    tagKey = isAllMode ? `limitless:${(tag as LimitlessTagItem).value}` : (tag as LimitlessTagItem).value;
                  } else if (typeof tag === "object" && tag !== null && "slug" in tag) {
                    const slug = (tag as PolymarketTag).slug;
                    tagKey = isAllMode ? `polymarket:${slug}` : slug;
                  } else {
                    tagKey = isAllMode ? `kalshi:${tag as string}` : (tag as string);
                  }
                  const isTagSelectedValue = isTagSelected(tag);
                  return (
                    <button
                      key={tagKey || `tag-${tagIndex}`}
                      onClick={() => handleTagClick(tag)}
                      aria-pressed={isTagSelectedValue}
                      aria-label={`Filter by ${tagLabel} tag`}
                      className={clsx(
                        "relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2",
                        isTagSelectedValue
                          ? "text-[#ffc000] border-b-[#ffc000]"
                          : "text-white/70 hover:text-white border-b-transparent"
                      )}
                    >
                      {tagLabel}
                    </button>
                  );
                })
              ) : (
                <span
                  className="px-4 py-3 text-sm text-white/50 italic"
                  role="status"
                >
                  No tags available for this category
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
