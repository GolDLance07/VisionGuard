"""
Alert manager interface (TRD §6.9).
V1 implements only the dashboard alert provider.
New providers (SMS, email, push) can be added without touching the risk engine.
"""
import logging
from abc import ABC, abstractmethod
from app.schemas.detection import DetectionFrame, RiskLevel

logger = logging.getLogger(__name__)


class AlertProvider(ABC):
    """Base interface for all alert providers."""

    @abstractmethod
    def on_high_risk(self, frame: DetectionFrame) -> None:
        """Called when a persistent HIGH risk frame is produced."""
        ...

    @abstractmethod
    def on_risk_cleared(self) -> None:
        """Called when risk drops back to LOW or MEDIUM."""
        ...


class DashboardAlertProvider(AlertProvider):
    """
    V1 dashboard provider — logs the alert.
    The WebSocket already delivers the risk_level to the frontend;
    this provider is the hook point for side effects (logging, future SMS etc).
    """

    def on_high_risk(self, frame: DetectionFrame) -> None:
        reasons = " | ".join(r.details for r in frame.reasons)
        logger.warning(
            f"POTENTIAL SAFETY RISK — score={frame.risk_score:.2f} "
            f"reasons=[{reasons}]"
        )

    def on_risk_cleared(self) -> None:
        logger.info("Risk condition cleared")


class AlertManager:
    """
    Routes risk events to all registered providers.
    V1 ships with DashboardAlertProvider only.
    """

    def __init__(self):
        self._providers: list[AlertProvider] = [DashboardAlertProvider()]
        self._was_high: bool = False

    def process(self, frame: DetectionFrame) -> None:
        is_high = frame.risk_level == RiskLevel.HIGH
        if is_high and not self._was_high:
            for p in self._providers:
                p.on_high_risk(frame)
        elif not is_high and self._was_high:
            for p in self._providers:
                p.on_risk_cleared()
        self._was_high = is_high

    def add_provider(self, provider: AlertProvider) -> None:
        self._providers.append(provider)
