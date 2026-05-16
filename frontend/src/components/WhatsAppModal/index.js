import React, { useState, useEffect } from "react";
import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";

import {
	Dialog,
	DialogContent,
	DialogTitle,
	Button,
	DialogActions,
	CircularProgress,
	TextField,
	Switch,
	FormControlLabel,
	Select,
	MenuItem,
	InputLabel,
	FormControl,
	Typography,
	Divider,
} from "@material-ui/core";

import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import QueueSelect from "../QueueSelect";

const PROVIDERS = [
	{ value: "wwebjs", label: "WhatsApp Web JS" },
	{ value: "whaileys", label: "Whaileys (Baileys)" },
	{ value: "evolution", label: "Evolution API" },
	{ value: "waha", label: "Waha" },
	{ value: "meta", label: "Meta Oficial (Cloud API)" },
];

const PROVIDER_FIELDS = {
	evolution: [
		{ name: "apiUrl", label: i18n => i18n.t("whatsappModal.form.apiUrl"), required: true },
		{ name: "apiToken", label: i18n => i18n.t("whatsappModal.form.apiToken"), required: true, secret: true },
		{ name: "webhookUrl", label: i18n => i18n.t("whatsappModal.form.webhookUrl"), required: false },
	],
	waha: [
		{ name: "apiUrl", label: i18n => i18n.t("whatsappModal.form.apiUrl"), required: true },
		{ name: "webhookUrl", label: i18n => i18n.t("whatsappModal.form.webhookUrl"), required: false },
	],
	meta: [
		{ name: "phoneNumberId", label: i18n => i18n.t("whatsappModal.form.phoneNumberId"), required: true },
		{ name: "accessToken", label: i18n => i18n.t("whatsappModal.form.accessToken"), required: true, secret: true },
		{ name: "businessAccountId", label: i18n => i18n.t("whatsappModal.form.businessAccountId"), required: true },
		{ name: "webhookSecret", label: i18n => i18n.t("whatsappModal.form.webhookSecret"), required: false, secret: true },
	],
};

const initialProviderConfig = (provider) => {
	const fields = PROVIDER_FIELDS[provider] || [];
	const config = {};
	fields.forEach(f => { config[f.name] = ""; });
	return JSON.stringify(config);
};

const useStyles = makeStyles(theme => ({
	root: {
		display: "flex",
		flexWrap: "wrap",
	},

	multFieldLine: {
		display: "flex",
		"& > *:not(:last-child)": {
			marginRight: theme.spacing(1),
		},
	},

	btnWrapper: {
		position: "relative",
	},

	buttonProgress: {
		color: green[500],
		position: "absolute",
		top: "50%",
		left: "50%",
		marginTop: -12,
		marginLeft: -12,
	},
}));

const SessionSchema = Yup.object().shape({
	name: Yup.string()
		.min(2, "Too Short!")
		.max(50, "Too Long!")
		.required("Required"),
});

const WhatsAppModal = ({ open, onClose, whatsAppId }) => {
	const classes = useStyles();
	const initialState = {
		name: "",
		greetingMessage: "",
		farewellMessage: "",
		isDefault: false,
		provider: "wwebjs",
		providerConfig: "{}",
	};
	const [whatsApp, setWhatsApp] = useState(initialState);
	const [selectedQueueIds, setSelectedQueueIds] = useState([]);
	const [selectedProvider, setSelectedProvider] = useState("wwebjs");

	useEffect(() => {
		const fetchSession = async () => {
			if (!whatsAppId) return;

			try {
				const { data } = await api.get(`whatsapp/${whatsAppId}`);
				setWhatsApp(data);
				setSelectedProvider(data.provider || "wwebjs");

				const whatsQueueIds = data.queues?.map(queue => queue.id);
				setSelectedQueueIds(whatsQueueIds);
			} catch (err) {
				toastError(err);
			}
		};
		fetchSession();
	}, [whatsAppId]);

	const handleSaveWhatsApp = async values => {
		const whatsappData = {
			...values,
			provider: selectedProvider,
			providerConfig: values.providerConfig,
			queueIds: selectedQueueIds,
		};

		try {
			if (whatsAppId) {
				await api.put(`/whatsapp/${whatsAppId}`, whatsappData);
			} else {
				await api.post("/whatsapp", whatsappData);
			}
			toast.success(i18n.t("whatsappModal.success"));
			handleClose();
		} catch (err) {
			toastError(err);
		}
	};

	const handleClose = () => {
		onClose();
		setWhatsApp(initialState);
		setSelectedProvider("wwebjs");
	};

	const handleProviderChange = (e, setFieldValue) => {
		const provider = e.target.value;
		setSelectedProvider(provider);
		setFieldValue("provider", provider);
		setFieldValue("providerConfig", initialProviderConfig(provider));
	};

	return (
		<div className={classes.root}>
			<Dialog
				open={open}
				onClose={handleClose}
				maxWidth="sm"
				fullWidth
				scroll="paper"
			>
				<DialogTitle>
					{whatsAppId
						? i18n.t("whatsappModal.title.edit")
						: i18n.t("whatsappModal.title.add")}
				</DialogTitle>
				<Formik
					initialValues={whatsApp}
					enableReinitialize={true}
					validationSchema={SessionSchema}
					onSubmit={(values, actions) => {
						setTimeout(() => {
							handleSaveWhatsApp(values);
							actions.setSubmitting(false);
						}, 400);
					}}
				>
					{({ values, touched, errors, isSubmitting, setFieldValue }) => (
						<Form>
							<DialogContent dividers>
								<div className={classes.multFieldLine}>
									<Field
										as={TextField}
										label={i18n.t("whatsappModal.form.name")}
										autoFocus
										name="name"
										error={touched.name && Boolean(errors.name)}
										helperText={touched.name && errors.name}
										variant="outlined"
										margin="dense"
										className={classes.textField}
									/>
									<FormControlLabel
										control={
											<Field
												as={Switch}
												color="primary"
												name="isDefault"
												checked={values.isDefault}
											/>
										}
										label={i18n.t("whatsappModal.form.default")}
									/>
								</div>

								<Divider style={{ margin: "12px 0" }} />
								<Typography variant="subtitle2" gutterBottom>
									{i18n.t("whatsappModal.form.provider")}
								</Typography>
								<FormControl variant="outlined" margin="dense" fullWidth>
									<InputLabel>
										{i18n.t("whatsappModal.form.provider")}
									</InputLabel>
									<Field
										as={Select}
										name="provider"
										value={selectedProvider}
										onChange={e => handleProviderChange(e, setFieldValue)}
										label={i18n.t("whatsappModal.form.provider")}
									>
										{PROVIDERS.map(p => (
											<MenuItem key={p.value} value={p.value}>
												{p.label}
											</MenuItem>
										))}
									</Field>
								</FormControl>

								{PROVIDER_FIELDS[selectedProvider]?.map(field => {
									const parsed = (() => {
										try { return JSON.parse(values.providerConfig || "{}"); }
										catch { return {}; }
									})();
									const fieldValue = parsed[field.name] || "";

									return (
										<div key={field.name}>
											<TextField
												label={field.label(i18n)}
												fullWidth
												variant="outlined"
												margin="dense"
												type={field.secret ? "password" : "text"}
												required={field.required}
												value={fieldValue}
												onChange={e => {
													const updated = { ...parsed, [field.name]: e.target.value };
													setFieldValue("providerConfig", JSON.stringify(updated));
												}}
											/>
										</div>
									);
								})}

								<Divider style={{ margin: "12px 0" }} />

								<div>
									<Field
										as={TextField}
										label={i18n.t("queueModal.form.greetingMessage")}
										type="greetingMessage"
										multiline
										rows={5}
										fullWidth
										name="greetingMessage"
										error={
											touched.greetingMessage && Boolean(errors.greetingMessage)
										}
										helperText={
											touched.greetingMessage && errors.greetingMessage
										}
										variant="outlined"
										margin="dense"
									/>
								</div>
								<div>
									<Field
										as={TextField}
										label={i18n.t("whatsappModal.form.farewellMessage")}
										type="farewellMessage"
										multiline
										rows={5}
										fullWidth
										name="farewellMessage"
										error={
											touched.farewellMessage && Boolean(errors.farewellMessage)
										}
										helperText={
											touched.farewellMessage && errors.farewellMessage
										}
										variant="outlined"
										margin="dense"
									/>
								</div>
								<QueueSelect
									selectedQueueIds={selectedQueueIds}
									onChange={selectedIds => setSelectedQueueIds(selectedIds)}
								/>
							</DialogContent>
							<DialogActions>
								<Button
									onClick={handleClose}
									color="secondary"
									disabled={isSubmitting}
									variant="outlined"
								>
									{i18n.t("whatsappModal.buttons.cancel")}
								</Button>
								<Button
									type="submit"
									color="primary"
									disabled={isSubmitting}
									variant="contained"
									className={classes.btnWrapper}
								>
									{whatsAppId
										? i18n.t("whatsappModal.buttons.okEdit")
										: i18n.t("whatsappModal.buttons.okAdd")}
									{isSubmitting && (
										<CircularProgress
											size={24}
											className={classes.buttonProgress}
										/>
									)}
								</Button>
							</DialogActions>
						</Form>
					)}
				</Formik>
			</Dialog>
		</div>
	);
};

export default React.memo(WhatsAppModal);
