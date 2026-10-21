import React from 'react';
import { Patient } from '../types';
import { WalkInModal } from './WalkInModal';

interface AddPatientModalProps {
  onClose: () => void;
  onPatientCreated: (patient: Patient) => void;
}

export const AddPatientModal: React.FC<AddPatientModalProps> = ({
  onClose,
  onPatientCreated
}) => {
  return (
    <WalkInModal
      onClose={onClose}
      onPatientCreated={onPatientCreated}
    />
  );
};
