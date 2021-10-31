import React, {
  ForwardedRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { StyleSheet } from "react-native";
import {
  GestureEvent,
  PanGestureHandler,
  PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export enum OpenDirection {
  LEFT = "left",
  RIGHT = "right",
  NONE = "none",
}

const renderNull = () => null;

type VoidPromiseFn = () => Promise<void>;
type OpenPromiseFn = (snapPoint?: number) => Promise<void>;

export type UnderlayParams<T> = {
  item: T;
  open: OpenPromiseFn;
  close: VoidPromiseFn;
  percentOpen: Animated.DerivedValue<number>;
  isGestureActive: Animated.DerivedValue<boolean>;
  direction: OpenDirection;
};

export type OverlayParams<T> = {
  item: T;
  openLeft: OpenPromiseFn;
  openRight: OpenPromiseFn;
  close: VoidPromiseFn;
  openDirection: OpenDirection;
  percentOpenLeft: Animated.DerivedValue<number>;
  percentOpenRight: Animated.DerivedValue<number>;
};

const UnderlayContext = React.createContext<
  UnderlayParams<unknown> | undefined
>(undefined);
const OverlayContext = React.createContext<OverlayParams<unknown> | undefined>(
  undefined
);

export type RenderUnderlay<T> = (params: UnderlayParams<T>) => React.ReactNode;
export type RenderOverlay<T> = (params: OverlayParams<T>) => React.ReactNode;

type Props<T> = {
  item: T;
  children?: React.ReactNode;
  renderOverlay?: RenderOverlay<T>;
  renderUnderlayLeft?: RenderUnderlay<T>;
  renderUnderlayRight?: RenderUnderlay<T>;
  onChange?: (params: { open: OpenDirection; snapPoint: number }) => void;
  overSwipe?: number;
  animationConfig?: Partial<Animated.WithSpringConfig>;
  activationThreshold?: number;
  swipeEnabled?: boolean;
  snapPointsLeft?: number[];
  snapPointsRight?: number[];
  swipeDamping?: number;
};

export type SwipeableItemImperativeRef = {
  open: (openDirection: OpenDirection, snapPoint?: number) => Promise<void>;
  close: () => Promise<void>;
};

function SwipeableItem<T>(
  props: Props<T>,
  ref: ForwardedRef<SwipeableItemImperativeRef>
) {
  const {
    item,
    children,
    renderOverlay = renderNull,
    renderUnderlayLeft = renderNull,
    renderUnderlayRight = renderNull,
    snapPointsLeft = [],
    snapPointsRight = [],
    swipeEnabled,
    activationThreshold = 20,
    overSwipe = 20,
    swipeDamping = 10,
    onChange = () => {},
    animationConfig = {},
  } = props;

  const springConfig: Animated.WithSpringConfig = {
    damping: 20,
    mass: 0.2,
    stiffness: 100,
    overshootClamping: false,
    restSpeedThreshold: 0.5,
    restDisplacementThreshold: 0.5,
    ...animationConfig,
  };

  const [openDirection, setOpenDirection] = useState(OpenDirection.NONE);

  const animStatePos = useSharedValue(0);
  const isGestureActive = useSharedValue(false);

  const swipingLeft = useDerivedValue(
    () => animStatePos.value < 0,
    [animStatePos]
  );
  const swipingRight = useDerivedValue(
    () => animStatePos.value > 0,
    [animStatePos]
  );

  const maxSnapPointLeft = -1 * (Math.max(...snapPointsLeft) || 0);
  const maxSnapPointRight = Math.max(...snapPointsRight) || 0;

  const maxTranslateLeft = maxSnapPointLeft - overSwipe;
  const maxTranslateRight = maxSnapPointRight + overSwipe;

  const percentOpenLeft = useDerivedValue(() => {
    return swipingLeft.value
      ? Math.abs(animStatePos.value / maxSnapPointLeft)
      : 0;
  }, []);
  const percentOpenRight = useDerivedValue(() => {
    return swipingRight.value
      ? Math.abs(animStatePos.value / maxSnapPointRight)
      : 0;
  }, []);

  const hasLeft = !!snapPointsLeft?.length;
  const hasRight = !!snapPointsRight?.length;

  const activeOffsetL =
    hasLeft || openDirection === OpenDirection.RIGHT
      ? -activationThreshold
      : -Number.MAX_VALUE;
  const activeOffsetR =
    hasRight || openDirection === OpenDirection.LEFT
      ? activationThreshold
      : Number.MAX_VALUE;
  const activeOffsetX = [activeOffsetL, activeOffsetR];

  const leftStyle = useAnimatedStyle(
    () => ({ opacity: percentOpenLeft.value > 0 ? 1 : 0 }),
    []
  );
  const rightStyle = useAnimatedStyle(
    () => ({ opacity: percentOpenRight.value > 0 ? 1 : 0 }),
    []
  );
  const overlayStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: animStatePos.value }] }),
    [animStatePos]
  );

  function openLeft(snapPoint?: number) {
    return new Promise<void>((resolve) => {
      function resolvePromiseIfFinished(isFinished: boolean) {
        if (isFinished) resolve();
      }
      animStatePos.value = withSpring(
        snapPoint ?? maxSnapPointLeft,
        springConfig,
        (isFinished) => {
          runOnJS(resolvePromiseIfFinished)(isFinished);
        }
      );
    });
  }
  function openRight(snapPoint?: number) {
    return new Promise<void>((resolve) => {
      function resolvePromiseIfFinished(isFinished: boolean) {
        if (isFinished) resolve();
      }
      animStatePos.value = withSpring(
        snapPoint ?? maxSnapPointRight,
        springConfig,
        (isFinished) => {
          runOnJS(resolvePromiseIfFinished)(isFinished);
        }
      );
    });
  }

  function close() {
    return new Promise<void>((resolve) => {
      function resolvePromiseIfFinished(isFinished: boolean) {
        if (isFinished) resolve();
      }
      animStatePos.value = withSpring(0, springConfig, (isFinished) => {
        runOnJS(resolvePromiseIfFinished)(isFinished);
      });
    });
  }

  useImperativeHandle(ref, () => ({
    open: (openDirection: OpenDirection, snapPoint?: number) => {
      if (openDirection === OpenDirection.LEFT) return openLeft(snapPoint);
      if (openDirection === OpenDirection.RIGHT) return openRight(snapPoint);
      return close();
    },
    close,
  }));

  function onAnimationEnd(openDirection: OpenDirection, snapPoint: number) {
    setOpenDirection(openDirection);
    onChange({ open: openDirection, snapPoint });
  }

  const onGestureEvent = useAnimatedGestureHandler<
    GestureEvent<PanGestureHandlerEventPayload>,
    { startX: number }
  >({
    onStart: (evt, ctx) => {
      ctx.startX = animStatePos.value;
      isGestureActive.value = true;
    },
    onActive: (evt, ctx) => {
      const rawVal = evt.translationX + ctx.startX;
      const clampedVal = Math.min(
        Math.max(maxTranslateLeft, rawVal),
        maxTranslateRight
      );
      animStatePos.value = clampedVal;
    },
    onEnd: (evt) => {
      isGestureActive.value = false;

      // Approximate where item would end up with velocity taken into account
      const velocityModifiedPosition =
        animStatePos.value + evt.velocityX / swipeDamping;

      const allSnapPoints = snapPointsLeft
        .map((p) => p * -1)
        .concat(snapPointsRight);

      // The user is not required to designate [0] in their snap point array,
      // but we need to make sure 0 is a snap point.

      allSnapPoints.push(0);

      const closestSnapPoint = allSnapPoints.reduce((acc, cur) => {
        const diff = Math.abs(velocityModifiedPosition - cur);
        const prevDiff = Math.abs(velocityModifiedPosition - acc);
        return diff < prevDiff ? cur : acc;
      }, Infinity);

      const onComplete = () => {
        const openDirection =
          closestSnapPoint === 0
            ? OpenDirection.NONE
            : closestSnapPoint > 0
            ? OpenDirection.RIGHT
            : OpenDirection.LEFT;
        runOnJS(onAnimationEnd)(openDirection, Math.abs(closestSnapPoint));
      };
      if (animStatePos.value === closestSnapPoint) onComplete();
      else
        animStatePos.value = withSpring(
          closestSnapPoint,
          springConfig,
          onComplete
        );
    },
  });

  const sharedParams = useMemo(
    () => ({
      item,
      isGestureActive,
      close,
    }),
    []
  );

  const underlayRightParams = useMemo(() => {
    return {
      open: openRight,
      percentOpen: percentOpenRight,
      direction: OpenDirection.RIGHT,
      ...sharedParams,
    };
  }, [percentOpenRight, openRight, sharedParams]);

  const underlayLeftParams = useMemo(() => {
    return {
      open: openLeft,
      percentOpen: percentOpenLeft,
      direction: OpenDirection.LEFT,
      ...sharedParams,
    };
  }, [item, percentOpenLeft, openLeft, sharedParams]);

  const overlayParams = useMemo(() => {
    // If there is only one swipe direction, use it as the 'open' function. Otherwise we need to choose one.
    const open =
      hasLeft && !hasRight
        ? openLeft
        : hasRight && !hasLeft
        ? openRight
        : openLeft;

    return {
      openLeft: openLeft,
      openRight: openRight,
      percentOpenLeft,
      percentOpenRight,
      openDirection,
      open,
      ...sharedParams,
    };
  }, [
    openLeft,
    openRight,
    openDirection,
    percentOpenLeft,
    percentOpenRight,
    hasLeft,
    hasRight,
  ]);

  return (
    <OverlayContext.Provider value={overlayParams}>
      <Animated.View
        pointerEvents={openDirection === OpenDirection.LEFT ? "auto" : "none"}
        style={[styles.underlay, leftStyle]}
      >
        <UnderlayContext.Provider value={underlayLeftParams}>
          {renderUnderlayLeft(underlayLeftParams)}
        </UnderlayContext.Provider>
      </Animated.View>
      <Animated.View
        pointerEvents={openDirection === OpenDirection.RIGHT ? "auto" : "none"}
        style={[styles.underlay, rightStyle]}
      >
        <UnderlayContext.Provider value={underlayRightParams}>
          {renderUnderlayRight(underlayRightParams)}
        </UnderlayContext.Provider>
      </Animated.View>
      <PanGestureHandler
        enabled={swipeEnabled}
        activeOffsetX={activeOffsetX}
        onGestureEvent={onGestureEvent}
      >
        <Animated.View style={[styles.flex, overlayStyle]}>
          {children}
          {renderOverlay(overlayParams)}
        </Animated.View>
      </PanGestureHandler>
    </OverlayContext.Provider>
  );
}

export default React.forwardRef(SwipeableItem);

export function useUnderlayParams<T>() {
  const underlayContext = useContext(UnderlayContext);
  if (!underlayContext) {
    throw new Error(
      "useUnderlayParams must be called from within an UnderlayContext.Provider!"
    );
  }
  return underlayContext as UnderlayParams<T>;
}

export function useOverlayParams<T>() {
  const overlayContext = useContext(OverlayContext);
  if (!overlayContext) {
    throw new Error(
      "useOverlayParams must be called from within an OverlayContext.Provider!"
    );
  }
  return overlayContext as OverlayParams<T>;
}

export function useSwipeableItemParams<T>() {
  const overlayContext = useContext(OverlayContext) as
    | OverlayParams<T>
    | undefined;
  if (!overlayContext) {
    throw new Error(
      "useOverlayParams must be called from within an OverlayContext.Provider!"
    );
  }
  const underlayContext = useContext(UnderlayContext);
  const contextDirection = underlayContext?.direction;

  const open = useCallback(
    (snapPoint?: number, direction?: OpenDirection) => {
      const openFnLeft = overlayContext.openLeft;
      const openFnRight = overlayContext.openRight;
      const openDirection = direction || contextDirection;
      const openFn =
        openDirection === OpenDirection.LEFT ? openFnLeft : openFnRight;
      return openFn(snapPoint);
    },
    [overlayContext, contextDirection]
  );

  const percentOpen = useMemo(() => {
    if (contextDirection) {
      // If we're calling from within an underlay context, return the open percentage of that underlay
      return contextDirection === OpenDirection.LEFT
        ? overlayContext.percentOpenLeft
        : overlayContext.percentOpenRight;
    }
    // Return the open percentage of the active swipe direction
    return overlayContext.openDirection === OpenDirection.LEFT
      ? overlayContext.percentOpenLeft
      : overlayContext.percentOpenRight;
  }, [overlayContext]);

  return {
    ...overlayContext,
    open,
    percentOpen,
  };
}

const styles = StyleSheet.create({
  underlay: {
    ...StyleSheet.absoluteFillObject,
  },
  flex: {
    flex: 1,
  },
});
