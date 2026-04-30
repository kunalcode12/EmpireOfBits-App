import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../constants/theme';

interface Props {
  onResign: () => void;
  onOfferDraw: () => void;
  disabled?: boolean;
}

export function DrawResignControls({ onResign, onOfferDraw, disabled }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <View style={styles.row}>
      <Pressable style={[styles.button, disabled && styles.disabled]} disabled={disabled} onPress={onOfferDraw}>
        <Text style={styles.buttonText}>Offer Draw</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.danger, disabled && styles.disabled]} disabled={disabled} onPress={() => setConfirming(true)}>
        <Text style={styles.buttonText}>Resign</Text>
      </Pressable>

      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Are you sure you want to resign?</Text>
            <Text style={styles.modalText}>You will lose this game.</Text>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalButton, styles.secondary]} onPress={() => setConfirming(false)}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.danger]}
                onPress={() => {
                  setConfirming(false);
                  onResign();
                }}
              >
                <Text style={styles.buttonText}>Resign</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '900',
  },
  modalText: {
    color: colors.mutedText,
    fontSize: typography.body,
    marginTop: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  modalButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: colors.surfaceElevated,
  },
  secondaryText: {
    color: colors.mutedText,
    fontWeight: '800',
  },
});
